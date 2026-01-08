// src/screens/RideLive.js
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';

import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from '../components/MapView';
import { auth, db } from '../lib/firebase';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { subscribeToLiveLocation } from '../lib/liveLocation';

function toNum(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function hasLatLng(p) {
  const lat = toNum(p?.lat);
  const lng = toNum(p?.lng);
  return lat !== null && lng !== null;
}

function normStatus(v) {
  return typeof v === 'string' ? v.trim().toLowerCase() : '';
}

function normalizeFirestoreError(e) {
  const code = e?.code || '';
  const msg = e?.message || 'Error desconocido';
  if (code === 'permission-denied' || /insufficient permissions/i.test(msg)) {
    return 'Missing or insufficient permissions.';
  }
  return msg;
}

export default function RideLive() {
  const navigation = useNavigation();
  const routeNav = useRoute();
  const { rideId } = routeNav.params || {};

  const [ride, setRide] = useState(null);
  const [loading, setLoading] = useState(true);

  const [ratingSaving, setRatingSaving] = useState(false);

  // ✅ live passenger marker (desde liveLocations)
  const [passengerLive, setPassengerLive] = useState(null);

  const mapRef = useRef(null);

  useEffect(() => {
    if (!rideId) return;

    const ref = doc(db, 'rides', rideId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setLoading(false);
        if (!snap.exists()) {
          setRide(null);
          return;
        }
        setRide({ id: snap.id, ...snap.data() });
      },
      () => setLoading(false)
    );

    return () => unsub();
  }, [rideId]);

  const status = normStatus(ride?.status);
  const uid = auth.currentUser?.uid || null;

  const isPassengerMe = !!uid && !!ride?.passengerId && ride.passengerId === uid;
  const isDriverMe = !!uid && !!ride?.driverId && ride.driverId === uid;

  // Escuchar passenger live location (sirve para chofer y también para pasajero)
  useEffect(() => {
    if (!ride?.passengerId) return;

    const unsub = subscribeToLiveLocation(ride.passengerId, (loc) => {
      if (loc?.lat && loc?.lng) setPassengerLive({ lat: loc.lat, lng: loc.lng });
    });

    return () => {
      try {
        unsub?.();
      } catch (_) {}
    };
  }, [ride?.passengerId]);

  const originStatic = useMemo(() => ride?.origin || null, [ride]);
  const destination = useMemo(() => ride?.destination || null, [ride]);
  const driverLoc = useMemo(() => ride?.driverLocation || null, [ride]);

  // ✅ origen dinámico:
  // - si hay passengerLive úsalo, si no usa origin (el punto inicial)
  const passengerPoint = useMemo(() => {
    if (hasLatLng(passengerLive)) return passengerLive;
    if (hasLatLng(originStatic)) return originStatic;
    return null;
  }, [passengerLive, originStatic]);

  const routeCoords = useMemo(() => {
    const coords = ride?.route?.coords;
    if (!Array.isArray(coords) || coords.length === 0) return [];
    return coords
      .filter((p) => typeof p?.latitude === 'number' && typeof p?.longitude === 'number')
      .map((p) => ({ latitude: p.latitude, longitude: p.longitude }));
  }, [ride]);

  useEffect(() => {
    if (!mapRef.current) return;

    const points = [];
    if (hasLatLng(driverLoc)) points.push({ latitude: driverLoc.lat, longitude: driverLoc.lng });
    if (hasLatLng(passengerPoint)) points.push({ latitude: passengerPoint.lat, longitude: passengerPoint.lng });
    if (hasLatLng(destination)) points.push({ latitude: destination.lat, longitude: destination.lng });

    if (points.length < 2) return;

    try {
      mapRef.current.fitToCoordinates(points, {
        edgePadding: { top: 80, right: 60, bottom: 240, left: 60 },
        animated: true,
      });
    } catch (_) {}
  }, [driverLoc, passengerPoint, destination]);

  const title = useMemo(() => {
    if (status === 'assigned') return 'Taxi en camino';
    if (status === 'in_progress') return 'Viaje en curso';
    if (status === 'open' || status === 'searching') return 'Buscando taxi';
    if (status === 'finished') return 'Viaje finalizado';
    if (status === 'completed') return 'Viaje finalizado';
    if (status === 'cancelled') return 'Viaje cancelado';
    return 'Viaje';
  }, [status]);

  const driverName = ride?.driverName || ride?.driver?.name || '—';
  const driverPlate = ride?.driverPlate || ride?.driver?.plate || '—';

  const openChat = () => {
    if (!rideId) return;
    navigation.navigate('ChatRide', { rideId });
  };

  const passengerRated =
    !!ride?.passengerRated ||
    !!ride?.passengerRating ||
    !!ride?.ratingPassenger;

  async function submitRating(label) {
    if (!rideId) return;
    if (ratingSaving) return;

    setRatingSaving(true);
    try {
      const myUid = auth.currentUser?.uid || null;

      const patchRatingOnly = {
        passengerRating: label,
        passengerRated: true,
        passengerRatedAt: serverTimestamp(),
        passengerRatedBy: myUid,
      };

      const patchWithComplete = {
        ...patchRatingOnly,
        ...(status === 'finished'
          ? { status: 'completed', completedAt: serverTimestamp() }
          : null),
      };

      try {
        await updateDoc(doc(db, 'rides', rideId), patchWithComplete);
      } catch (e1) {
        const msg1 = normalizeFirestoreError(e1);
        if (/insufficient permissions/i.test(msg1) || e1?.code === 'permission-denied') {
          await updateDoc(doc(db, 'rides', rideId), patchRatingOnly);
        } else {
          throw e1;
        }
      }

      Alert.alert('Gracias', 'Tu calificación fue registrada.');

      navigation.reset({
        index: 0,
        routes: [{ name: isDriverMe ? 'DriverHome' : 'PassengerHome' }],
      });
    } catch (e) {
      console.log('rating error:', e?.message);
      Alert.alert('Error', normalizeFirestoreError(e));
    } finally {
      setRatingSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 10 }}>Cargando viaje…</Text>
      </View>
    );
  }

  if (!ride) {
    return (
      <View style={styles.center}>
        <Text>No se encontró el viaje.</Text>
      </View>
    );
  }

  const initialRegion = hasLatLng(passengerPoint)
    ? { latitude: passengerPoint.lat, longitude: passengerPoint.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }
    : hasLatLng(destination)
    ? { latitude: destination.lat, longitude: destination.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }
    : { latitude: -1.0, longitude: -78.0, latitudeDelta: 10, longitudeDelta: 10 };

  const showChat = ['assigned', 'in_progress', 'finished', 'completed', 'cancelled'].includes(status);
  const showRating = isPassengerMe && status === 'finished' && !passengerRated;

  return (
    <View style={styles.root}>
      <View style={styles.mapWrap}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          initialRegion={initialRegion}
          mapStyleVariant="light"
        >
          {hasLatLng(passengerPoint) && (
            <Marker
              coordinate={{ latitude: passengerPoint.lat, longitude: passengerPoint.lng }}
              title="Pasajero"
              pinColor="green"
            />
          )}

          {hasLatLng(destination) && (
            <Marker
              coordinate={{ latitude: destination.lat, longitude: destination.lng }}
              title="Destino"
              pinColor="red"
            />
          )}

          {hasLatLng(driverLoc) && (
            <Marker
              coordinate={{ latitude: driverLoc.lat, longitude: driverLoc.lng }}
              title="Taxi"
              description="Conductor en movimiento"
              pinColor="#1877f2"
            />
          )}

          {routeCoords.length > 1 && (
            <Polyline coordinates={routeCoords} strokeWidth={5} strokeColor="#1877f2" />
          )}
        </MapView>
      </View>

      <View style={styles.sheet} pointerEvents="auto">
        <Text style={styles.title}>{title}</Text>

        {(status === 'assigned' || status === 'in_progress') && (
          <>
            <Text style={styles.meta}>
              Conductor: <Text style={styles.bold}>{driverName}</Text>
            </Text>
            <Text style={styles.meta}>
              Placa: <Text style={styles.bold}>{driverPlate}</Text>
            </Text>
          </>
        )}

        {showChat && (
          <TouchableOpacity style={styles.btn} onPress={openChat} activeOpacity={0.85}>
            <Text style={styles.btnText}>Abrir chat</Text>
          </TouchableOpacity>
        )}

        {showRating && (
          <View style={{ marginTop: 12 }}>
            <Text style={{ fontWeight: '800', marginBottom: 8 }}>
              ¿Cómo estuvo el servicio?
            </Text>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={[styles.rateBtn, { backgroundColor: '#6c757d', opacity: ratingSaving ? 0.7 : 1 }]}
                disabled={ratingSaving}
                onPress={() => submitRating('Regular')}
                activeOpacity={0.85}
              >
                <Text style={styles.rateText}>{ratingSaving ? '...' : 'Regular'}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.rateBtn, { backgroundColor: '#0d6efd', opacity: ratingSaving ? 0.7 : 1 }]}
                disabled={ratingSaving}
                onPress={() => submitRating('Bueno')}
                activeOpacity={0.85}
              >
                <Text style={styles.rateText}>{ratingSaving ? '...' : 'Bueno'}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.rateBtn, { backgroundColor: '#198754', opacity: ratingSaving ? 0.7 : 1 }]}
                disabled={ratingSaving}
                onPress={() => submitRating('Excelente')}
                activeOpacity={0.85}
              >
                <Text style={styles.rateText}>{ratingSaving ? '...' : 'Excelente'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {(status === 'completed' || (status === 'finished' && passengerRated)) && (
          <View style={{ marginTop: 12 }}>
            <Text style={{ fontWeight: '800' }}>Gracias por calificar.</Text>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: '#555' }]}
              onPress={() =>
                navigation.reset({
                  index: 0,
                  routes: [{ name: isDriverMe ? 'DriverHome' : 'PassengerHome' }],
                })
              }
              activeOpacity={0.85}
            >
              <Text style={styles.btnText}>Volver al inicio</Text>
            </TouchableOpacity>
          </View>
        )}

        {status === 'cancelled' && (
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: '#555', marginTop: 12 }]}
            onPress={() =>
              navigation.reset({
                index: 0,
                routes: [{ name: isDriverMe ? 'DriverHome' : 'PassengerHome' }],
              })
            }
            activeOpacity={0.85}
          >
            <Text style={styles.btnText}>Volver al inicio</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },

  mapWrap: { flex: 1, zIndex: 0 },
  map: { flex: 1 },

  sheet: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
    zIndex: 50,
    elevation: 50,
    ...(Platform.OS === 'web' ? { position: 'relative' } : null),
  },

  title: { fontSize: 20, fontWeight: '800', marginBottom: 6 },
  meta: { fontSize: 14, marginTop: 2 },
  bold: { fontWeight: '800' },

  btn: {
    marginTop: 12,
    backgroundColor: '#1877f2',
    padding: 14,
    borderRadius: 10,
  },
  btnText: { color: '#fff', textAlign: 'center', fontWeight: '800' },

  rateBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rateText: { color: 'white', fontWeight: '800' },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
