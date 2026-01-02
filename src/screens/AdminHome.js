// src/screens/AdminHome.js
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  collection,
  onSnapshot,
  query,
  where,
  doc,
  getDoc,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { goToAppStart } from '../lib/goHome';

function formatStatus(s) {
  const v = (s || '').toLowerCase();
  if (v === 'open') return 'abierto';
  if (v === 'searching') return 'buscando';
  if (v === 'assigned') return 'asignado';
  if (v === 'finished') return 'finalizado';
  if (v === 'cancelled') return 'cancelado';
  return s || '—';
}

export default function AdminHome() {
  const navigation = useNavigation();

  const [rides, setRides] = useState([]); // open/searching
  const [history, setHistory] = useState([]); // solo secretary
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState(null);
  const isSecretary = useMemo(() => role === 'secretary', [role]);

  // 1) Leer rol del usuario logueado
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const uid = auth.currentUser?.uid;
        if (!uid) {
          if (mounted) setRole(null);
          return;
        }
        const uref = doc(db, 'users', uid);
        const usnap = await getDoc(uref);
        const r = usnap.exists() ? usnap.data()?.role : null;
        if (mounted) setRole(r || null);
      } catch (e) {
        console.log('Error leyendo role:', e);
        if (mounted) setRole(null);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // 2) Solicitudes disponibles (open/searching) -> todos los admins
  useEffect(() => {
    const qOpen = query(
      collection(db, 'rides'),
      where('status', 'in', ['open', 'searching'])
    );

    const unsub = onSnapshot(
      qOpen,
      (snap) => {
        const data = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        setRides(data);
        setLoading(false);
      },
      (err) => {
        console.log(err);
        Alert.alert('Error', 'No se pudieron cargar las solicitudes');
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  // 3) Historial SOLO para secretary (últimas 50)
  useEffect(() => {
    if (!isSecretary) {
      setHistory([]);
      return;
    }

    const qHistory = query(
      collection(db, 'rides'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsub = onSnapshot(
      qHistory,
      (snap) => {
        const data = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        setHistory(data);
      },
      (err) => {
        console.log(err);
        // No bloquea el panel de solicitudes, pero avisamos.
        Alert.alert('Aviso', 'No se pudo cargar el historial completo.');
      }
    );

    return () => unsub();
  }, [isSecretary]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 10 }}>
        Solicitudes disponibles
      </Text>

      <TouchableOpacity
        style={{
          backgroundColor: '#1877f2',
          padding: 12,
          borderRadius: 8,
          marginBottom: 12,
        }}
        onPress={() => navigation.navigate('RequestsMap')}
      >
        <Text style={{ color: 'white', textAlign: 'center', fontWeight: '700' }}>
          Ver solicitudes en mapa
        </Text>
      </TouchableOpacity>

      {/* ✅ Volver al inicio real (Landing) */}
      <TouchableOpacity
        style={{
          backgroundColor: '#555',
          padding: 12,
          borderRadius: 8,
          marginBottom: 12,
        }}
        onPress={() => goToAppStart(navigation)}
      >
        <Text style={{ color: 'white', textAlign: 'center', fontWeight: '700' }}>
          Volver al inicio
        </Text>
      </TouchableOpacity>

      {rides.length === 0 ? (
        <Text>No hay solicitudes pendientes</Text>
      ) : (
        <FlatList
          data={rides}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={{
                padding: 14,
                borderRadius: 10,
                backgroundColor: '#f2f2f2',
                marginBottom: 10,
              }}
              onPress={() => navigation.navigate('AssignRide', { rideId: item.id })}
            >
              <Text style={{ fontWeight: '700' }}>
                Carrera ID: {item.id.slice(0, 6)}
              </Text>
              <Text>Precio: ${item.price}</Text>
              <Text>Estado: {formatStatus(item.status)}</Text>
            </TouchableOpacity>
          )}
        />
      )}

      {/* ======================
          HISTORIAL (secretary)
         ====================== */}
      {isSecretary && (
        <View style={{ marginTop: 18 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', marginBottom: 10 }}>
            Historial (últimas 50)
          </Text>

          {history.length === 0 ? (
            <Text>No hay historial para mostrar.</Text>
          ) : (
            <FlatList
              data={history}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    backgroundColor: '#fff',
                    borderWidth: 1,
                    borderColor: '#eee',
                    marginBottom: 10,
                  }}
                  // Si quieres, puedes abrir AssignRide para ver detalle
                  onPress={() => navigation.navigate('AssignRide', { rideId: item.id })}
                >
                  <Text style={{ fontWeight: '700' }}>
                    ID: {item.id.slice(0, 6)} — {formatStatus(item.status)}
                  </Text>
                  <Text>Precio: ${item.price ?? '—'}</Text>
                  <Text>Pasajero: {item.passengerId ? item.passengerId.slice(0, 6) : '—'}</Text>
                  <Text>Chofer: {item.driverName || item.driver?.name || '—'}</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      )}
    </View>
  );
}
