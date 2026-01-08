// src/screens/DriverHome.js
import React, { useEffect, useRef, useState } from 'react';
import { View, FlatList, Button, Text, Alert, ActivityIndicator, TouchableOpacity } from 'react-native';
import { collection, onSnapshot, query, where, runTransaction, doc, limit } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../lib/firebase';
import { startDriverLiveLocation } from '../lib/liveLocation';

const DRIVER_ACTIVE_STATUSES = ['assigned', 'in_progress', 'finished']; // ✅ assigned es el importante

export default function DriverHome({ navigation }) {
  const [rides, setRides] = useState([]);
  const [uid, setUid] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [myActiveRide, setMyActiveRide] = useState(null);

  const lastStartedRideIdRef = useRef(null);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUid(u?.uid ?? null);
      setLoadingAuth(false);
    });
    return () => unsubAuth();
  }, []);

  // Lista de solicitudes abiertas
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

  // ✅ Detectar carrera activa del chofer para “volver a ingresar”
  useEffect(() => {
    if (!uid) return;

    const qMineActive = query(
      collection(db, 'rides'),
      where('driverId', '==', uid),
      where('status', 'in', DRIVER_ACTIVE_STATUSES),
      limit(1)
    );

    const unsub = onSnapshot(
      qMineActive,
      (snap) => {
        if (snap.empty) {
          setMyActiveRide(null);
          return;
        }
        const d = snap.docs[0];
        setMyActiveRide({ id: d.id, ...d.data() });
      },
      (err) => console.log('SNAP my active ERROR >>', err.code, err.message)
    );

    return () => unsub();
  }, [uid]);

  // Mantener tracking activo si tiene carrera assigned/in_progress
  useEffect(() => {
    if (!uid) return;

    const qMineForTracking = query(
      collection(db, 'rides'),
      where('driverId', '==', uid),
      where('status', 'in', ['assigned', 'in_progress']),
      limit(1)
    );

    const unsub = onSnapshot(
      qMineForTracking,
      async (snap) => {
        if (snap.empty) return;

        const d = snap.docs[0];
        const rideId = d.id;

        if (lastStartedRideIdRef.current === rideId) return;

        try {
          lastStartedRideIdRef.current = rideId;
          await startDriverLiveLocation(rideId);
          console.log('✅ Tracking activo para rideId=', rideId);
        } catch (e) {
          console.log('⚠️ No se pudo iniciar tracking en DriverHome:', e?.message);
        }
      },
      (err) => console.log('SNAP my tracking ERROR >>', err.code, err.message)
    );

    return () => unsub();
  }, [uid]);

  const acceptRide = async (rideId) => {
    try {
      if (!uid) {
        Alert.alert('Sesión requerida', 'Inicia sesión como conductor para aceptar un viaje.');
        return;
      }

      // Si ya tiene carrera, no permitir tomar otra
      if (myActiveRide?.id) {
        Alert.alert('No disponible', 'Ya tienes una carrera activa.');
        return;
      }

      await runTransaction(db, async (tx) => {
        const ref = doc(db, 'rides', rideId);
        const snap = await tx.get(ref);

        if (!snap.exists()) throw new Error('La solicitud ya no existe.');
        const ride = snap.data();
        if ((ride.status || '').toLowerCase() !== 'open') throw new Error('La solicitud ya fue tomada.');

        tx.update(ref, { status: 'assigned', driverId: uid });
      });

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
      {/* ✅ Volver a la carrera */}
      {myActiveRide?.id ? (
        <View style={{ padding: 12, borderWidth: 1, borderColor: '#ddd', borderRadius: 12, marginBottom: 12 }}>
          <Text style={{ fontWeight: '900', marginBottom: 6 }}>Tienes una carrera activa</Text>
          <Text style={{ marginBottom: 8 }}>Estado: {myActiveRide.status}</Text>

          <TouchableOpacity
            style={{ backgroundColor: '#1877f2', padding: 12, borderRadius: 10 }}
            onPress={() => navigation.navigate('RideLive', { rideId: myActiveRide.id })}
            activeOpacity={0.85}
          >
            <Text style={{ color: 'white', textAlign: 'center', fontWeight: '900' }}>
              Volver a mi carrera
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <FlatList
        data={rides}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <View style={{ padding: 12, borderBottomWidth: 1, gap: 4 }}>
            <Text style={{ fontWeight: '700' }}>Solicitud: {item.id}</Text>
            <Text>
              Origen: {item.origin?.lat?.toFixed?.(4)}, {item.origin?.lng?.toFixed?.(4)}
            </Text>
            <Button title="Aceptar" onPress={() => acceptRide(item.id)} disabled={!uid || !!myActiveRide} />
          </View>
        )}
        ListEmptyComponent={<Text>No hay solicitudes abiertas.</Text>}
      />
    </View>
  );
}
