// src/screens/admin/RequestsMap.js
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  where,
  doc,
  getDoc,
  limit,
} from 'firebase/firestore';
import MapView, { PROVIDER_GOOGLE } from '../../components/MapView';
import { db, auth } from '../../lib/firebase';
import { goAdminHome } from '../../lib/goHome';

const SECRETARY_EMAIL = 'secretaxipangui11@gmail.com';

function isNumber(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function toNumber(v) {
  if (isNumber(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function hasLatLng(point) {
  const lat = toNumber(point?.lat);
  const lng = toNumber(point?.lng);
  return lat !== null && lng !== null;
}

export default function RequestsMap() {
  const navigation = useNavigation();
  const routeNav = useRoute();
  const focusId = routeNav.params?.focusId ?? null;

  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSecretary, setIsSecretary] = useState(false);

  // 1) Detectar si es secretaria por rol (y fallback por email)
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const u = auth.currentUser;
        if (!u) {
          if (mounted) setIsSecretary(false);
          return;
        }

        // Fallback por email (por si el rol no está bien seteado)
        const byEmail = (u.email || '').toLowerCase().trim() === SECRETARY_EMAIL;

        let byRole = false;
        try {
          const uref = doc(db, 'users', u.uid);
          const usnap = await getDoc(uref);
          const role = usnap.exists() ? usnap.data()?.role : null;
          byRole = role === 'secretary';
        } catch (_) {}

        if (mounted) setIsSecretary(byRole || byEmail);
      } catch (e) {
        console.log('Error leyendo secretaria:', e);
        if (mounted) setIsSecretary(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // 2) Suscripción según rol
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setLoading(false);
      return;
    }

    // ============================
    // A) SECRETARIA: VE TODO
    // ============================
    if (isSecretary) {
      const qAll = query(
        collection(db, 'rides'),
        orderBy('createdAt', 'desc'),
        limit(250) // evita cargar miles en el mapa
      );

      const unsubAll = onSnapshot(
        qAll,
        (snap) => {
          const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          const merged = all
            .filter((r) => hasLatLng(r?.origin))
            .sort((a, b) => {
              const ta = a?.createdAt?.seconds || 0;
              const tb = b?.createdAt?.seconds || 0;
              return tb - ta;
            });

          setRides(merged);
          setLoading(false);
        },
        (err) => {
          console.log(err);
          Alert.alert('Error', 'No se pudieron cargar las carreras (secretaria).');
          setLoading(false);
        }
      );

      return () => unsubAll();
    }

    // ==========================================
    // B) DRIVER_ADMIN: OPEN/SEARCHING + ASSIGNED MINE
    // ==========================================
    const qOpen = query(
      collection(db, 'rides'),
      where('status', 'in', ['open', 'searching']),
      orderBy('createdAt', 'desc')
    );

    const qAssignedMine = query(
      collection(db, 'rides'),
      where('driverId', '==', uid),
      where('status', '==', 'assigned'),
      orderBy('createdAt', 'desc')
    );

    let openList = [];
    let assignedList = [];

    const mergeAndSet = () => {
      const map = new Map();
      [...openList, ...assignedList].forEach((r) => map.set(r.id, r));

      const merged = Array.from(map.values())
        .filter((r) => hasLatLng(r?.origin))
        .sort((a, b) => {
          const ta = a?.createdAt?.seconds || 0;
          const tb = b?.createdAt?.seconds || 0;
          return tb - ta;
        });

      setRides(merged);
      setLoading(false);
    };

    const unsub1 = onSnapshot(
      qOpen,
      (snap) => {
        openList = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        mergeAndSet();
      },
      (err) => {
        console.log(err);
        Alert.alert('Error', 'No se pudieron cargar las solicitudes.');
        setLoading(false);
      }
    );

    const unsub2 = onSnapshot(
      qAssignedMine,
      (snap) => {
        assignedList = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        mergeAndSet();
      },
      (err) => {
        console.log(err);
      }
    );

    return () => {
      unsub1();
      unsub2();
    };
  }, [isSecretary]);

  const focusedRide = useMemo(() => {
    if (!focusId) return null;
    return rides.find((r) => r.id === focusId) || null;
  }, [rides, focusId]);

  const initialRegion = useMemo(() => {
    const r = focusedRide || rides.find((x) => hasLatLng(x?.origin));
    if (!r) return null;

    const lat = toNumber(r.origin.lat);
    const lng = toNumber(r.origin.lng);
    if (lat === null || lng === null) return null;

    return {
      latitude: lat,
      longitude: lng,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };
  }, [focusedRide, rides]);

  if (loading && !initialRegion) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 8 }}>Cargando solicitudes…</Text>
      </View>
    );
  }

  if (!initialRegion) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text>No hay solicitudes con ubicación aún.</Text>

        <TouchableOpacity
          style={{
            marginTop: 12,
            backgroundColor: '#555',
            padding: 12,
            borderRadius: 10,
          }}
          onPress={() => goAdminHome(navigation)}
        >
          <Text style={{ color: 'white', fontWeight: '700' }}>Volver al inicio</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <MapView
        style={{ flex: 1 }}
        provider={PROVIDER_GOOGLE}
        initialRegion={initialRegion}
        rides={rides}
      />

      <View style={{ padding: 12 }}>
        <TouchableOpacity
          style={{
            backgroundColor: '#555',
            padding: 12,
            borderRadius: 10,
          }}
          onPress={() => goAdminHome(navigation)}
        >
          <Text style={{ color: 'white', textAlign: 'center', fontWeight: '700' }}>
            Volver al inicio
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
