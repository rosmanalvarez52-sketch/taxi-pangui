// src/screens/DriverHome.js
import React, { useEffect, useRef, useState } from 'react';
import { View, FlatList, Button, Text, Alert, ActivityIndicator } from 'react-native';
import {
  collection,
  onSnapshot,
  query,
  where,
  runTransaction,
  doc,
  limit,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../lib/firebase';

// ✅ IMPORTANTE: iniciar tracking del chofer
import { startDriverLiveLocation } from '../lib/liveLocation';

export default function DriverHome() {
  const [rides, setRides] = useState([]);
  const [uid, setUid] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // Evitar re-lanzar startDriverLiveLocation repetidamente
  const lastStartedRideIdRef = useRef(null);

  // 1) Esperar a que haya sesión
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUid(u?.uid ?? null);
      setLoadingAuth(false);
    });
    return () => unsubAuth();
  }, []);

  // 2) Suscribirse a solicitudes abiertas (para lista)
  useEffect(() => {
    if (!uid) return;

    const qOpen = query(collection(db, 'rides'), where('status', '==', 'open'));
    const unsub = onSnapshot(
      qOpen,
      (snap) => setRides(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.log('SNAP ERROR >>', err.code, err.message)
    );

    return () => unsub();
  }, [uid]);

  // ✅ 3) Mantener tracking activo si el chofer tiene una carrera asignada
  // (esto corrige el caso donde el chofer vuelve a abrir la app/pantalla y no se reinicia el tracking)
  useEffect(() => {
    if (!uid) return;

    const qMineAssigned = query(
      collection(db, 'rides'),
      where('status', '==', 'assigned'),
      where('driverId', '==', uid),
      limit(1)
    );

    const unsub = onSnapshot(
      qMineAssigned,
      async (snap) => {
        if (snap.empty) return;

        const d = snap.docs[0];
        const rideId = d.id;

        // Evitar loops
        if (lastStartedRideIdRef.current === rideId) return;

        try {
          lastStartedRideIdRef.current = rideId;
          await startDriverLiveLocation(rideId);
          console.log('✅ Tracking activo para rideId=', rideId);
        } catch (e) {
          console.log('⚠️ No se pudo iniciar tracking en DriverHome:', e?.message);
        }
      },
      (err) => console.log('SNAP my assigned ERROR >>', err.code, err.message)
    );

    return () => unsub();
  }, [uid]);

  // 4) Aceptar viaje con transacción + iniciar tracking
  const acceptRide = async (rideId) => {
    try {
      if (!uid) {
        Alert.alert('Sesión requerida', 'Inicia sesión como conductor para aceptar un viaje.');
        return;
      }

      await runTransaction(db, async (tx) => {
        const ref = doc(db, 'rides', rideId);
        const snap = await tx.get(ref);

        if (!snap.exists()) throw new Error('La solicitud ya no existe.');
        const ride = snap.data();
        if (ride.status !== 'open') throw new Error('La solicitud ya fue tomada.');

        // Reglas esperan driverId y cambio de estado open -> assigned
        tx.update(ref, { status: 'assigned', driverId: uid });
      });

      // ✅ CLAVE: arrancar ubicación en vivo del chofer para este rideId
      try {
        lastStartedRideIdRef.current = rideId;
        await startDriverLiveLocation(rideId);
      } catch (e) {
        console.log('⚠️ startDriverLiveLocation falló:', e?.message);
      }

      Alert.alert('Asignado', 'Conduce al origen.');
    } catch (e) {
      Alert.alert('No disponible', e?.message ?? 'Error inesperado');
    }
  };

  if (loadingAuth) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 12 }}>
      <FlatList
        data={rides}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <View style={{ padding: 12, borderBottomWidth: 1, gap: 4 }}>
            <Text>Oferta: ${item.offer}</Text>
            <Text>
              Origen: {item.origin?.lat?.toFixed?.(4)}, {item.origin?.lng?.toFixed?.(4)}
            </Text>
            <Button title="Aceptar" onPress={() => acceptRide(item.id)} disabled={!uid} />
          </View>
        )}
        ListEmptyComponent={<Text>No hay solicitudes abiertas.</Text>}
      />
    </View>
  );
}
