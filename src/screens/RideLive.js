// src/screens/RideLive.js
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useRoute, useNavigation, CommonActions } from '@react-navigation/native';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

// ✅ ubicación del pasajero
import * as Location from 'expo-location';

// ✅ Mapa unificado (native/web)
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from '../components/MapView';

// ✅ Direcciones (Google Directions)
import { getRoute } from '../lib/googleDirections';

/** =========================
 *  Utils: distancia y ETA fallback
 *  ========================= */
function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function etaMinutes(distanceKm, speedKmh = 25) {
  if (!distanceKm || distanceKm <= 0) return null;
  const hours = distanceKm / speedKmh;
  return Math.max(1, Math.round(hours * 60));
}

function toNum(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function hasPoint(p) {
  const lat = toNum(p?.lat);
  const lng = toNum(p?.lng);
  return lat !== null && lng !== null;
}

function asLatLng(p) {
  return { lat: toNum(p.lat), lng: toNum(p.lng) };
}

function buildInitialRegion(points) {
  const valid = (points || [])
    .filter(Boolean)
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (!valid.length) return null;

  const lats = valid.map((p) => p.lat);
  const lngs = valid.map((p) => p.lng);

  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;

  const latDelta = Math.max(0.02, (maxLat - minLat) * 1.8);
  const lngDelta = Math.max(0.02, (maxLng - minLng) * 1.8);

  return {
    latitude: centerLat,
    longitude: centerLng,
    latitudeDelta: latDelta,
    longitudeDelta: lngDelta,
  };
}

export default function RideLive() {
  const route = useRoute();
  const navigation = useNavigation();
  const rideId = route.params?.rideId;

  const [ride, setRide] = useState(null);
  const [loading, setLoading] = useState(true);

  const [savingRating, setSavingRating] = useState(false);

  const [pickupRoute, setPickupRoute] = useState(null);
  const [tripRoute, setTripRoute] = useState(null);

  // ✅ pasajero en vivo
  const [passengerLoc, setPassengerLoc] = useState(null);
  const passengerWatchRef = useRef(null);

  const lastPickupCalcRef = useRef(0);
  const lastDriverPosRef = useRef(null);

  // ✅ ref mapa
  const mapRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const camTimerRef = useRef(null);

  useEffect(() => {
    if (!rideId) return;

    const ref = doc(db, 'rides', rideId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setRide(null);
          setLoading(false);
          return;
        }
        setRide({ id: snap.id, ...snap.data() });
        setLoading(false);
      },
      (err) => {
        console.log(err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [rideId]);

  /** ✅ Track pasajero */
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;

        if (passengerWatchRef.current) {
          passengerWatchRef.current.remove();
          passengerWatchRef.current = null;
        }

        passengerWatchRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 3000,
            distanceInterval: 3,
          },
          (pos) => {
            if (!mounted) return;
            const { latitude, longitude } = pos.coords || {};
            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
            setPassengerLoc({ lat: latitude, lng: longitude });
          }
        );
      } catch (e) {
        console.log('Passenger watch error:', e?.message);
      }
    })();

    return () => {
      mounted = false;
      try {
        if (passengerWatchRef.current) {
          passengerWatchRef.current.remove();
          passengerWatchRef.current = null;
        }
      } catch (_) {}
    };
  }, []);

  /** Trip route */
  useEffect(() => {
    if (!ride) return;

    if (Array.isArray(ride?.route?.coords) && ride.route.coords.length > 1) {
      setTripRoute({
        coords: ride.route.coords,
        distanceKm: typeof ride.distanceKm === 'number' ? ride.distanceKm : null,
        durationMin: typeof ride.etaMin === 'number' ? ride.etaMin : null,
        source: 'ride.route',
      });
      return;
    }

    if (!hasPoint(ride?.origin) || !hasPoint(ride?.destination)) return;

    (async () => {
      try {
        const o = asLatLng(ride.origin);
        const d = asLatLng(ride.destination);
        const r = await getRoute({ origin: o, destination: d });

        setTripRoute({
          coords: r.coords || [],
          distanceKm: r.distanceKm ?? null,
          durationMin: r.durationMin ?? null,
          source: 'directions',
        });
      } catch (e) {
        console.log('Trip route error:', e?.message);
        setTripRoute(null);
      }
    })();
  }, [ride?.id, ride?.origin, ride?.destination, ride?.route]);

  /** Pickup route */
  useEffect(() => {
    if (!ride) return;
    if (!hasPoint(ride?.driverLocation)) return;

    const pickupTarget =
      passengerLoc && hasPoint(passengerLoc)
        ? passengerLoc
        : hasPoint(ride?.origin)
        ? ride.origin
        : null;

    if (!pickupTarget) return;

    const now = Date.now();
    const minMsBetween = 12000;
    if (now - lastPickupCalcRef.current < minMsBetween) return;

    const driverNow = asLatLng(ride.driverLocation);
    const targetNow = asLatLng(pickupTarget);

    const prev = lastDriverPosRef.current;
    if (prev?.lat && prev?.lng) {
      const moved = haversineKm(prev.lat, prev.lng, driverNow.lat, driverNow.lng);
      if (moved < 0.02) return;
    }

    lastPickupCalcRef.current = now;
    lastDriverPosRef.current = driverNow;

    (async () => {
      try {
        const r = await getRoute({ origin: driverNow, destination: targetNow });
        setPickupRoute({
          coords: r.coords || [],
          distanceKm: r.distanceKm ?? null,
          durationMin: r.durationMin ?? null,
          source: 'directions',
        });
      } catch (e) {
        const dKm = haversineKm(driverNow.lat, driverNow.lng, targetNow.lat, targetNow.lng);
        const eta = etaMinutes(dKm, 25);
        setPickupRoute({
          coords: null,
          distanceKm: dKm,
          durationMin: eta,
          source: 'haversine',
        });
      }
    })();
  }, [ride?.driverLocation, ride?.origin, ride?.id, passengerLoc]);

  /** ETA fallback */
  const livePickupFallback = useMemo(() => {
    if (!hasPoint(ride?.driverLocation)) return null;

    const target =
      passengerLoc && hasPoint(passengerLoc)
        ? passengerLoc
        : hasPoint(ride?.origin)
        ? ride.origin
        : null;

    if (!target) return null;

    const o = asLatLng(target);
    const d = asLatLng(ride.driverLocation);

    const dKm = haversineKm(d.lat, d.lng, o.lat, o.lng);
    const etaMin = etaMinutes(dKm, 25);
    return { dKm, etaMin };
  }, [ride?.driverLocation, ride?.origin, passengerLoc]);

  /** Rating */
  const isMyRideAsPassenger = useMemo(() => {
    const uid = auth.currentUser?.uid;
    return !!uid && !!ride?.passengerId && ride.passengerId === uid;
  }, [ride]);

  const canRate = useMemo(() => {
    if (!isMyRideAsPassenger) return false;
    if (ride?.status !== 'finished') return false;

    const r = ride?.rating;
    if (typeof r === 'number') return false;
    if (r && typeof r === 'object' && typeof r.score === 'number') return false;
    return true;
  }, [ride, isMyRideAsPassenger]);

  function goPassengerStart() {
    const candidates = ['PassengerHome', 'RequestTaxi', 'Home', 'Landing'];
    for (const name of candidates) {
      try {
        navigation.dispatch(
          CommonActions.reset({ index: 0, routes: [{ name }] })
        );
        return;
      } catch (_) {}
    }
    try { navigation.goBack(); } catch (_) {}
  }

  async function rateRide(score) {
    if (!ride?.id) return;
    if (!canRate) return;
    if (savingRating) return;

    const label = score === 1 ? 'Malo' : score === 2 ? 'Regular' : 'Excelente';

    setSavingRating(true);
    try {
      const ref = doc(db, 'rides', ride.id);
      await updateDoc(ref, {
        rating: {
          score,
          label,
          by: auth.currentUser?.uid || null,
          createdAt: serverTimestamp(),
        },
      });

      Alert.alert('Gracias', `Calificación registrada: ${label}`, [
        { text: 'OK', onPress: () => goPassengerStart() },
      ]);
    } catch (e) {
      console.log(e);
      Alert.alert('Error', e?.message || 'No se pudo guardar la calificación.');
    } finally {
      setSavingRating(false);
    }
  }

  const ratingScore =
    typeof ride?.rating === 'number'
      ? ride.rating
      : typeof ride?.rating?.score === 'number'
      ? ride.rating.score
      : null;

  /** Pasajero punto actual */
  const passengerPoint = useMemo(() => {
    if (passengerLoc && hasPoint(passengerLoc)) return passengerLoc;
    if (hasPoint(ride?.origin)) return ride.origin;
    return null;
  }, [passengerLoc, ride?.origin]);

  const initialRegion = useMemo(() => {
    const pts = [];
    if (passengerPoint) pts.push(asLatLng(passengerPoint));
    if (hasPoint(ride?.destination)) pts.push(asLatLng(ride.destination));
    if (hasPoint(ride?.driverLocation)) pts.push(asLatLng(ride.driverLocation));
    return buildInitialRegion(pts);
  }, [passengerPoint, ride?.destination, ride?.driverLocation]);

  const pickupPolylineCoords = useMemo(() => {
    if (!pickupRoute?.coords?.length) return [];
    return pickupRoute.coords.map((p) => ({ latitude: p.latitude, longitude: p.longitude }));
  }, [pickupRoute]);

  const tripPolylineCoords = useMemo(() => {
    if (!tripRoute?.coords?.length) return [];
    return tripRoute.coords.map((p) => ({ latitude: p.latitude, longitude: p.longitude }));
  }, [tripRoute]);

  /** ✅ Seguir taxi/pasajero (cámara) */
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!mapReady) return;

    const map = mapRef.current;
    if (!map) return;

    const pts = [];

    if (passengerPoint && Number.isFinite(passengerPoint.lat) && Number.isFinite(passengerPoint.lng)) {
      pts.push({ latitude: passengerPoint.lat, longitude: passengerPoint.lng });
    }

    if (hasPoint(ride?.driverLocation)) {
      const lat = toNum(ride.driverLocation.lat);
      const lng = toNum(ride.driverLocation.lng);
      if (lat != null && lng != null) pts.push({ latitude: lat, longitude: lng });
    }

    if (!pts.length) return;

    if (camTimerRef.current) clearTimeout(camTimerRef.current);

    camTimerRef.current = setTimeout(() => {
      try {
        if (typeof map.fitToCoordinates === 'function' && pts.length >= 2) {
          map.fitToCoordinates(pts, {
            edgePadding: { top: 70, right: 60, bottom: 260, left: 60 },
            animated: true,
          });
          return;
        }
      } catch (_) {}

      try {
        const c = pts[pts.length - 1];
        if (typeof map.animateToRegion === 'function') {
          map.animateToRegion(
            {
              latitude: c.latitude,
              longitude: c.longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            },
            500
          );
        }
      } catch (_) {}
    }, 120);

    return () => {
      if (camTimerRef.current) clearTimeout(camTimerRef.current);
    };
  }, [ride?.driverLocation, passengerPoint, mapReady]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
        <Text>Cargando…</Text>
      </View>
    );
  }

  if (!ride) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text>No se encontró la carrera.</Text>
      </View>
    );
  }

  const pickupKm =
    typeof pickupRoute?.distanceKm === 'number'
      ? pickupRoute.distanceKm
      : livePickupFallback?.dKm ?? null;

  const pickupEta =
    typeof pickupRoute?.durationMin === 'number'
      ? pickupRoute.durationMin
      : livePickupFallback?.etaMin ?? null;

  const tripKm =
    typeof tripRoute?.distanceKm === 'number'
      ? tripRoute.distanceKm
      : typeof ride?.distanceKm === 'number'
      ? ride.distanceKm
      : null;

  const tripEta =
    typeof tripRoute?.durationMin === 'number'
      ? tripRoute.durationMin
      : typeof ride?.etaMin === 'number'
      ? ride.etaMin
      : null;

  const showMap = !!initialRegion;
  const showChat = ['assigned', 'finished'].includes(ride.status);

  return (
    <View style={{ flex: 1 }}>
      {showMap ? (
        <View style={{ flex: 1 }}>
          <MapView
            ref={mapRef}
            style={{ flex: 1 }}
            provider={Platform.OS === 'web' ? undefined : PROVIDER_GOOGLE}
            initialRegion={initialRegion}
            onMapReady={() => setMapReady(true)}
          >
            {passengerPoint && (
              <Marker
                coordinate={{ latitude: passengerPoint.lat, longitude: passengerPoint.lng }}
                title="Tu ubicación"
                description="Posición actual"
                pinColor="green"
              />
            )}

            {hasPoint(ride?.destination) && (
              <Marker
                coordinate={{
                  latitude: toNum(ride.destination.lat),
                  longitude: toNum(ride.destination.lng),
                }}
                title="Destino"
                description="Punto de llegada"
                pinColor="black"
              />
            )}

            {hasPoint(ride?.driverLocation) && (
              <Marker
                coordinate={{
                  latitude: toNum(ride.driverLocation.lat),
                  longitude: toNum(ride.driverLocation.lng),
                }}
                title="Taxi"
                description="Conductor en movimiento"
                pinColor="#1877f2"
              />
            )}

            {pickupPolylineCoords.length > 1 && (
              <Polyline coordinates={pickupPolylineCoords} strokeWidth={4} strokeColor="#FF9800" />
            )}

            {tripPolylineCoords.length > 1 && (
              <Polyline coordinates={tripPolylineCoords} strokeWidth={4} strokeColor="#1877f2" />
            )}
          </MapView>
        </View>
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text>No hay datos de ubicación para mostrar el mapa.</Text>
        </View>
      )}

      <View style={{ padding: 16, backgroundColor: '#fff' }}>
        <Text style={{ fontSize: 18, fontWeight: '800', marginBottom: 8 }}>
          Taxi en camino
        </Text>

        <Text style={{ marginBottom: 6 }}>
          Estado: <Text style={{ fontWeight: '800' }}>{ride.status}</Text>
        </Text>

        <Text style={{ marginBottom: 6 }}>
          Conductor:{' '}
          <Text style={{ fontWeight: '800' }}>
            {ride.driverName || ride.driver?.name || '—'}
          </Text>
        </Text>

        <Text style={{ marginBottom: 10 }}>
          Placa:{' '}
          <Text style={{ fontWeight: '800' }}>
            {ride.driverPlate || ride.driver?.plate || '—'}
          </Text>
        </Text>

        {!ride.driverLocation ? (
          <Text style={{ color: '#666' }}>Esperando ubicación del taxi…</Text>
        ) : (
          <>
            <Text style={{ marginBottom: 4 }}>
              Distancia taxi → tú:{' '}
              <Text style={{ fontWeight: '800' }}>
                {pickupKm != null ? `${pickupKm.toFixed(2)} km` : '—'}
              </Text>
            </Text>
            <Text style={{ marginBottom: 8 }}>
              ETA taxi → tú:{' '}
              <Text style={{ fontWeight: '800' }}>
                {pickupEta != null ? `${pickupEta} min` : '—'}
              </Text>
            </Text>
          </>
        )}

        <Text style={{ marginBottom: 4 }}>
          Distancia (viaje):{' '}
          <Text style={{ fontWeight: '800' }}>
            {tripKm != null ? `${tripKm.toFixed(2)} km` : '—'}
          </Text>
        </Text>
        <Text style={{ marginBottom: 10 }}>
          ETA (viaje):{' '}
          <Text style={{ fontWeight: '800' }}>
            {tripEta != null ? `${tripEta} min` : '—'}
          </Text>
        </Text>

        {showChat && (
          <TouchableOpacity
            style={{
              marginTop: 6,
              marginBottom: 8,
              backgroundColor: '#1877f2',
              paddingVertical: 12,
              borderRadius: 10,
            }}
            onPress={() => navigation.navigate('ChatRide', { rideId: ride.id })}
          >
            <Text style={{ color: 'white', fontWeight: '900', textAlign: 'center' }}>
              Abrir chat
            </Text>
          </TouchableOpacity>
        )}

        <View style={{ marginTop: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#eee' }}>
          <Text style={{ fontSize: 16, fontWeight: '800', marginBottom: 10 }}>
            Calificar servicio
          </Text>

          {ratingScore ? (
            <Text>
              Tu calificación: <Text style={{ fontWeight: '800' }}>{ratingScore}</Text> (
              {ratingScore === 1 ? 'Malo' : ratingScore === 2 ? 'Regular' : 'Excelente'})
            </Text>
          ) : !canRate ? (
            <Text style={{ color: '#666' }}>
              Podrás calificar cuando el taxista marque la carrera como finalizada.
            </Text>
          ) : (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={() => rateRide(1)}
                disabled={savingRating}
                style={{
                  flex: 1,
                  backgroundColor: '#e74c3c',
                  paddingVertical: 12,
                  borderRadius: 10,
                  opacity: savingRating ? 0.6 : 1,
                }}
              >
                <Text style={{ color: 'white', fontWeight: '900', textAlign: 'center' }}>
                  Malo
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => rateRide(2)}
                disabled={savingRating}
                style={{
                  flex: 1,
                  backgroundColor: '#f39c12',
                  paddingVertical: 12,
                  borderRadius: 10,
                  opacity: savingRating ? 0.6 : 1,
                }}
              >
                <Text style={{ color: 'white', fontWeight: '900', textAlign: 'center' }}>
                  Regular
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => rateRide(3)}
                disabled={savingRating}
                style={{
                  flex: 1,
                  backgroundColor: '#2ecc71',
                  paddingVertical: 12,
                  borderRadius: 10,
                  opacity: savingRating ? 0.6 : 1,
                }}
              >
                <Text style={{ color: 'white', fontWeight: '900', textAlign: 'center' }}>
                  Excelente
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <Text style={{ marginTop: 10, fontSize: 12, color: '#888' }}>
          Nota: si Google Directions falla por clave/cuota, el ETA de recogida usa estimación por distancia.
        </Text>
      </View>
    </View>
  );
}
