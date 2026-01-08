// src/screens/PassengerHome.js
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Alert,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';

import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from '../components/MapView';
import { getRoute } from '../lib/googleDirections';
import { fareByDistance } from '../lib/fare';

import { auth, db } from '../lib/firebase';
import {
  addDoc,
  collection,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  getDocs,
  doc,
  updateDoc,
  limit,
  getDoc,
} from 'firebase/firestore';

import {
  setupLocalNotifications,
  notifyAssignedFull,
  clearAssignedNotification,
} from '../lib/notifications';

import { subscribeToDriverLocation, writeMyLiveLocation } from '../lib/liveLocation';
import { goToAppStart } from '../lib/goHome';

function toRad(x) {
  return (x * Math.PI) / 180;
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(s));
}

function estimateEtaPickupMin(driverPos, passengerPos) {
  const km = haversineKm(driverPos, passengerPos);
  const avgSpeedKmh = 25;
  const minutes = Math.max(1, Math.round((km / avgSpeedKmh) * 60));
  return Math.min(minutes, 999);
}

const MIN_FARE = 1.25;

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1d2c4d' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8ec3b9' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a3646' }] },
  { featureType: 'administrative.country', elementType: 'geometry.stroke', stylers: [{ color: '#4b6878' }] },
  { featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: '#64779e' }] },
  { featureType: 'administrative.province', elementType: 'geometry.stroke', stylers: [{ color: '#4b6878' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry.stroke', stylers: [{ color: '#334e87' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#023e58' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#283d6a' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#6f9ba5' }] },
  { featureType: 'poi', elementType: 'labels.text.stroke', stylers: [{ color: '#1d2c4d' }] },
  { featureType: 'poi.park', elementType: 'geometry.fill', stylers: [{ color: '#023e58' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#3C7680' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#304a7d' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#98a5be' }] },
  { featureType: 'road', elementType: 'labels.text.stroke', stylers: [{ color: '#1d2c4d' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2c6675' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#255763' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#b0d5ce' }] },
  { featureType: 'road.highway', elementType: 'labels.text.stroke', stylers: [{ color: '#023e58' }] },
  { featureType: 'transit', elementType: 'labels.text.fill', stylers: [{ color: '#98a5be' }] },
  { featureType: 'transit', elementType: 'labels.text.stroke', stylers: [{ color: '#1d2c4d' }] },
  { featureType: 'transit.line', elementType: 'geometry.fill', stylers: [{ color: '#283d6a' }] },
  { featureType: 'transit.station', elementType: 'geometry', stylers: [{ color: '#3a4762' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1626' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4e6d70' }] },
];

// ✅ Activa = hasta finished (para calificar). completed ya NO cuenta como activa.
const ACTIVE_RIDE_STATUSES = ['open', 'searching', 'assigned', 'in_progress', 'finished'];
const LIVE_VIEW_STATUSES = ['assigned', 'in_progress', 'finished'];

// ✅ IMPORTANTE por reglas: pasajero solo puede publicar passengerLocation en assigned/in_progress
const PASSENGER_RIDE_LOCATION_STATUSES = ['assigned', 'in_progress'];

async function confirmWebSafe(title, message) {
  if (Platform.OS === 'web') {
    try {
      return window.confirm(`${title}\n\n${message}`);
    } catch (_) {
      return true;
    }
  }

  return await new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'No', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Sí, cancelar', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

function alertWebSafe(title, message) {
  if (Platform.OS === 'web') {
    try {
      window.alert(`${title}\n\n${message}`);
    } catch (_) {}
    return;
  }
  Alert.alert(title, message);
}

export default function PassengerHome() {
  const navigation = useNavigation();

  const [origin, setOrigin] = useState(null);
  const [destination, setDestination] = useState(null);
  const [region, setRegion] = useState(null);

  const [polyline, setPolyline] = useState([]);
  const [distanceKm, setDistanceKm] = useState(null);
  const [etaMin, setEtaMin] = useState(null);
  const [loading, setLoading] = useState(false);

  const [routeQuality, setRouteQuality] = useState(null);

  const [passengerProfile, setPassengerProfile] = useState({ name: null, phone: null });

  const [activeRide, setActiveRide] = useState(null);
  const [loadingActiveRide, setLoadingActiveRide] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  const notifiedRidesRef = useRef(new Set());
  const driverUnsubRef = useRef(null);
  const lastPickupEtaRef = useRef(null);
  const lastNotifyAtRef = useRef(0);

  const passengerWatchRef = useRef(null);
  const regionLockedRef = useRef(false);

  const passengerLiveWatchRef = useRef(null);

  const lastRideLocWriteRef = useRef({ ts: 0, lat: null, lng: null });

  useEffect(() => {
    (async () => {
      try {
        const uid = auth.currentUser?.uid;
        if (!uid) return;

        const snap = await getDoc(doc(db, 'users', uid));
        if (!snap.exists()) return;

        const d = snap.data() || {};
        const fullName = `${(d.names || '').trim()} ${(d.surnames || '').trim()}`.trim();

        setPassengerProfile({
          name: fullName || null,
          phone: (d.phone || '').trim() || null,
        });
      } catch (e) {
        console.log('Passenger profile load error:', e?.message);
      }
    })();
  }, []);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setActiveRide(null);
      setLoadingActiveRide(false);
      return;
    }

    const qActive = query(
      collection(db, 'rides'),
      where('passengerId', '==', uid),
      where('status', 'in', ACTIVE_RIDE_STATUSES),
      limit(1)
    );

    const unsub = onSnapshot(
      qActive,
      (snap) => {
        if (snap.empty) {
          setActiveRide(null);
        } else {
          const d = snap.docs[0];
          setActiveRide({ id: d.id, ...d.data() });
        }
        setLoadingActiveRide(false);
      },
      (err) => {
        console.log(err);
        setLoadingActiveRide(false);
      }
    );

    return () => unsub();
  }, []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          alertWebSafe('Ubicación', 'Permiso de ubicación denegado.');
          return;
        }

        try {
          if (passengerWatchRef.current) {
            passengerWatchRef.current.remove();
            passengerWatchRef.current = null;
          }
        } catch (_) {}

        try {
          const first = await Location.getCurrentPositionAsync({
            accuracy:
              Platform.OS === 'android'
                ? Location.Accuracy.BestForNavigation
                : Location.Accuracy.High,
          });

          const { latitude, longitude } = first.coords || {};
          if (Number.isFinite(latitude) && Number.isFinite(longitude) && mounted) {
            const o = { lat: latitude, lng: longitude };
            setOrigin(o);

            if (!regionLockedRef.current) {
              regionLockedRef.current = true;
              setRegion({
                latitude: o.lat,
                longitude: o.lng,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
              });
            }
          }
        } catch (e) {
          console.log('Passenger first position error:', e?.message);
        }

        passengerWatchRef.current = await Location.watchPositionAsync(
          {
            accuracy:
              Platform.OS === 'android'
                ? Location.Accuracy.BestForNavigation
                : Location.Accuracy.High,
            timeInterval: 2000,
            distanceInterval: 2,
            mayShowUserSettingsDialog: true,
          },
          async (pos) => {
            if (!mounted) return;
            const { latitude, longitude } = pos.coords || {};
            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

            setOrigin({ lat: latitude, lng: longitude });

            if (!regionLockedRef.current) {
              regionLockedRef.current = true;
              setRegion({
                latitude,
                longitude,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
              });
            }

            const rideId = activeRide?.id || null;
            const st = (activeRide?.status || '').toLowerCase();

            if (rideId && PASSENGER_RIDE_LOCATION_STATUSES.includes(st)) {
              const now = Date.now();

              const last = lastRideLocWriteRef.current;
              const movedKm =
                last.lat != null && last.lng != null
                  ? haversineKm({ lat: last.lat, lng: last.lng }, { lat: latitude, lng: longitude })
                  : 999;

              const shouldWrite = now - last.ts >= 4000 || movedKm >= 0.01;

              if (shouldWrite) {
                lastRideLocWriteRef.current = { ts: now, lat: latitude, lng: longitude };
                try {
                  await updateDoc(doc(db, 'rides', rideId), {
                    passengerLocation: { lat: latitude, lng: longitude },
                    passengerLocationUpdatedAt: serverTimestamp(),
                  });
                } catch (e) {
                  console.log('passengerLocation update error:', e?.message);
                }
              }
            }
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
  }, [activeRide?.id, activeRide?.status]);

  useEffect(() => {
    const st = (activeRide?.status || '').toLowerCase();
    const shouldLive = !!activeRide?.id && ['assigned', 'in_progress', 'finished'].includes(st);

    (async () => {
      try {
        if (!shouldLive) {
          try {
            if (passengerLiveWatchRef.current) {
              passengerLiveWatchRef.current.remove();
              passengerLiveWatchRef.current = null;
            }
          } catch (_) {}
          return;
        }

        const ok = await Location.requestForegroundPermissionsAsync();
        if (ok?.status !== 'granted') return;

        try {
          if (passengerLiveWatchRef.current) {
            passengerLiveWatchRef.current.remove();
            passengerLiveWatchRef.current = null;
          }
        } catch (_) {}

        try {
          const p = await Location.getCurrentPositionAsync({
            accuracy:
              Platform.OS === 'android'
                ? Location.Accuracy.BestForNavigation
                : Location.Accuracy.High,
          });
          const { latitude, longitude } = p.coords || {};
          if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
            await writeMyLiveLocation({
              rideId: activeRide.id,
              isDriving: false,
              lat: latitude,
              lng: longitude,
            });
          }
        } catch (_) {}

        passengerLiveWatchRef.current = await Location.watchPositionAsync(
          {
            accuracy:
              Platform.OS === 'android'
                ? Location.Accuracy.BestForNavigation
                : Location.Accuracy.High,
            timeInterval: 2000,
            distanceInterval: 2,
            mayShowUserSettingsDialog: true,
          },
          async (pos) => {
            const { latitude, longitude } = pos.coords || {};
            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

            try {
              await writeMyLiveLocation({
                rideId: activeRide.id,
                isDriving: false,
                lat: latitude,
                lng: longitude,
              });
            } catch (_) {}
          }
        );
      } catch (e) {
        console.log('Passenger live publish error:', e?.message);
      }
    })();

    return () => {
      try {
        if (passengerLiveWatchRef.current) {
          passengerLiveWatchRef.current.remove();
          passengerLiveWatchRef.current = null;
        }
      } catch (_) {}
    };
  }, [activeRide?.id, activeRide?.status]);

  useEffect(() => {
    let unsubRides = null;

    (async () => {
      const ok = await setupLocalNotifications();
      if (!ok) return;

      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const q = query(collection(db, 'rides'), where('passengerId', '==', uid));

      unsubRides = onSnapshot(
        q,
        (snap) => {
          snap.docChanges().forEach((change) => {
            const rideId = change.doc.id;
            const data = change.doc.data() || {};
            const status = (data.status || 'open').toLowerCase();

            if (change.type === 'removed') return;

            if (status === 'assigned' && !notifiedRidesRef.current.has(rideId)) {
              notifiedRidesRef.current.add(rideId);

              notifyAssignedFull({
                driverName: data.driverName,
                driverPlate: data.driverPlate,
                etaToDestMin: typeof data.etaMin === 'number' ? data.etaMin : null,
                etaToPickupMin: typeof data.pickupEtaMin === 'number' ? data.pickupEtaMin : null,
              });

              if (driverUnsubRef.current) {
                driverUnsubRef.current();
                driverUnsubRef.current = null;
              }

              if (data.driverId && data.origin?.lat && data.origin?.lng) {
                lastPickupEtaRef.current =
                  typeof data.pickupEtaMin === 'number' ? data.pickupEtaMin : null;
                lastNotifyAtRef.current = Date.now();

                driverUnsubRef.current = subscribeToDriverLocation(data.driverId, (loc) => {
                  if (!loc?.lat || !loc?.lng) return;

                  const etaPickupRealtime = estimateEtaPickupMin(
                    { lat: loc.lat, lng: loc.lng },
                    { lat: data.origin.lat, lng: data.origin.lng }
                  );

                  const now = Date.now();
                  const prev = lastPickupEtaRef.current;
                  const changedEnough =
                    typeof prev !== 'number' || Math.abs(prev - etaPickupRealtime) >= 2;
                  const timeEnough = now - lastNotifyAtRef.current >= 45000;

                  if (changedEnough && timeEnough) {
                    lastPickupEtaRef.current = etaPickupRealtime;
                    lastNotifyAtRef.current = now;

                    notifyAssignedFull({
                      driverName: data.driverName,
                      driverPlate: data.driverPlate,
                      etaToDestMin: typeof data.etaMin === 'number' ? data.etaMin : null,
                      etaToPickupMin: etaPickupRealtime,
                    });
                  }
                });
              }
            }

            if (status === 'finished' || status === 'completed' || status === 'cancelled') {
              if (driverUnsubRef.current) {
                driverUnsubRef.current();
                driverUnsubRef.current = null;
              }
              clearAssignedNotification();
            }
          });
        },
        (err) => console.log(err)
      );
    })();

    return () => {
      unsubRides?.();
      if (driverUnsubRef.current) {
        driverUnsubRef.current();
        driverUnsubRef.current = null;
      }
    };
  }, []);

  const onLongPressMap = (e) => {
    if (activeRide) return;
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setDestination({ lat: latitude, lng: longitude });
  };

  useEffect(() => {
    if (!origin || !destination) return;

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setRouteQuality(null);

        const r = await getRoute({ origin, destination });
        if (cancelled) return;

        setPolyline(r.coords || []);
        setDistanceKm(r.distanceKm ?? null);
        setEtaMin(r.durationMin ?? null);
        setRouteQuality('exact');
      } catch (err) {
        console.log('getRoute error:', err?.message);
        if (cancelled) return;

        try {
          const km = haversineKm(origin, destination);
          const minutes = Math.max(1, Math.round((km / 25) * 60));

          setDistanceKm(km);
          setEtaMin(minutes);

          setPolyline([
            { latitude: origin.lat, longitude: origin.lng },
            { latitude: destination.lat, longitude: destination.lng },
          ]);

          setRouteQuality('approx');
        } catch (_) {
          setPolyline([]);
          setDistanceKm(null);
          setEtaMin(null);
          setRouteQuality(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [origin, destination]);

  const price = useMemo(() => {
    if (distanceKm == null) return null;

    const raw = fareByDistance(distanceKm);
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;

    return round2(Math.max(MIN_FARE, raw));
  }, [distanceKm]);

  async function hasActiveRide(uid) {
    const activeStatuses = ['open', 'assigned', 'searching', 'in_progress', 'finished'];
    const q = query(
      collection(db, 'rides'),
      where('passengerId', '==', uid),
      where('status', 'in', activeStatuses)
    );
    const snap = await getDocs(q);
    return !snap.empty;
  }

  async function getFreshPassengerOrigin() {
    try {
      const pos = await Location.getCurrentPositionAsync({
        accuracy:
          Platform.OS === 'android'
            ? Location.Accuracy.BestForNavigation
            : Location.Accuracy.High,
      });
      const { latitude, longitude } = pos.coords || {};
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return origin;
      return { lat: latitude, lng: longitude };
    } catch (_) {
      return origin;
    }
  }

  const createRideRequest = async () => {
    try {
      if (!origin || !destination || typeof price !== 'number' || !Number.isFinite(price)) {
        throw new Error('Completa origen, destino y espera el cálculo de precio.');
      }
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error('Debes iniciar sesión.');

      const already = await hasActiveRide(uid);
      if (already) {
        throw new Error('Ya tienes una carrera activa. Espera a que se complete o se cancele.');
      }

      const freshOrigin = await getFreshPassengerOrigin();
      if (!freshOrigin) throw new Error('No se pudo obtener tu ubicación actual.');

      const passengerName = passengerProfile?.name || null;
      const passengerPhone = passengerProfile?.phone || null;

      const ref = await addDoc(collection(db, 'rides'), {
        passengerId: uid,
        passengerName,
        passengerPhone,
        passenger: { uid, name: passengerName, phone: passengerPhone },

        origin: freshOrigin,
        destination,
        distanceKm,
        price,
        etaMin,
        status: 'open',
        createdAt: serverTimestamp(),
        route: polyline?.length ? { coords: polyline } : null,
      });

      alertWebSafe('Solicitud enviada', `Precio estimado: $${price}\nId: ${ref.id}`);
    } catch (e) {
      alertWebSafe('Error', e.message);
    }
  };

  const cancelActiveRide = async () => {
    if (cancelling) return;
    if (!activeRide?.id) return;

    const st = (activeRide.status || 'open').toLowerCase();
    if (!(st === 'open' || st === 'searching')) {
      alertWebSafe('No disponible', 'Solo puedes cancelar si la carrera aún está buscando taxi.');
      return;
    }

    const ok = await confirmWebSafe('Cancelar carrera', '¿Seguro que deseas cancelar esta carrera?');
    if (!ok) return;

    setCancelling(true);
    try {
      await updateDoc(doc(db, 'rides', activeRide.id), {
        status: 'cancelled',
        cancelledAt: serverTimestamp(),
      });

      setDestination(null);
      setPolyline([]);
      setDistanceKm(null);
      setEtaMin(null);
      setRouteQuality(null);

      alertWebSafe('Listo', 'Tu carrera fue cancelada. Ya puedes solicitar otra.');
    } catch (e) {
      console.log('cancelActiveRide error:', e);

      const msg =
        e?.code === 'permission-denied'
          ? 'Permiso denegado por reglas de Firestore. Verifica que tu usuario sea passenger y que la carrera esté open/searching.'
          : e?.message || 'No se pudo cancelar la carrera.';

      alertWebSafe('Error', msg);
    } finally {
      setCancelling(false);
    }
  };

  const goToLiveRide = () => {
    if (!activeRide?.id) return;
    navigation.navigate('RideLive', { rideId: activeRide.id });
  };

  const goHome = () => goToAppStart(navigation);

  const canRequest =
    !activeRide &&
    origin !== null &&
    destination !== null &&
    typeof price === 'number' &&
    Number.isFinite(price) &&
    !loading;

  const showCancel =
    !!activeRide && ['open', 'searching'].includes((activeRide.status || '').toLowerCase());

  const showLive =
    !!activeRide && LIVE_VIEW_STATUSES.includes((activeRide.status || '').toLowerCase());

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Solicitar Taxi</Text>

        {/* ✅ ÚNICO CAMBIO: texto correcto para WEB */}
        <Text style={styles.headerSubtitle}>
          {activeRide
            ? 'Tienes una carrera activa. Revisa el estado abajo.'
            : Platform.OS === 'web'
              ? 'Haz clic en el mapa para elegir el destino'
              : 'Mantén presionado el mapa para elegir el destino'}
        </Text>
      </View>

      <View style={styles.mapContainer}>
        {region ? (
          <MapView
            style={styles.map}
            provider={PROVIDER_GOOGLE}
            initialRegion={region}
            onLongPress={onLongPressMap}
            customMapStyle={Platform.OS === 'web' ? undefined : DARK_MAP_STYLE}
            onPickDestination={(coord) => {
              if (activeRide) return;
              setDestination({ lat: coord.latitude, lng: coord.longitude });
            }}
          >
            {origin && (
              <Marker
                coordinate={{ latitude: origin.lat, longitude: origin.lng }}
                title="Origen"
                pinColor="green"
              />
            )}

            {destination && (
              <Marker
                coordinate={{ latitude: destination.lat, longitude: destination.lng }}
                title="Destino"
              />
            )}

            {polyline.length > 1 && (
              <Polyline
                coordinates={polyline.map((p) => ({
                  latitude: p.latitude,
                  longitude: p.longitude,
                }))}
                strokeWidth={5}
                strokeColor={routeQuality === 'approx' ? '#FFD54F' : '#1877f2'}
              />
            )}
          </MapView>
        ) : (
          <View style={styles.loadingMap}>
            <ActivityIndicator size="large" />
            <Text>Obteniendo tu ubicación…</Text>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        {loadingActiveRide ? (
          <Text>Verificando carrera activa…</Text>
        ) : activeRide ? (
          <View style={styles.activeRideCard}>
            <Text style={styles.activeRideTitle}>Carrera activa</Text>
            <Text>
              Estado: <Text style={styles.bold}>{activeRide.status}</Text>
            </Text>
            <Text>
              Chofer:{' '}
              <Text style={styles.bold}>
                {activeRide.driverName || activeRide.driver?.name || '—'}
              </Text>
            </Text>
            <Text>
              Placa:{' '}
              <Text style={styles.bold}>
                {activeRide.driverPlate || activeRide.driver?.plate || '—'}
              </Text>
            </Text>
          </View>
        ) : null}

        {routeQuality === 'approx' && (
          <View style={styles.bannerWarn}>
            <Text style={styles.bannerWarnText}>
              No se pudo obtener la ruta exacta. Se muestra una estimación aproximada.
            </Text>
          </View>
        )}

        <Text>Distancia: {distanceKm ? `${distanceKm.toFixed(2)} km` : '—'}</Text>
        <Text>ETA: {etaMin ? `${etaMin} min` : '—'}</Text>
        <Text>
          Precio: {typeof price === 'number' ? `$${price}` : '—'}{' '}
          {typeof price === 'number' ? `(mínimo $${MIN_FARE.toFixed(2)})` : ''}
        </Text>

        <View style={styles.row}>
          <TouchableOpacity
            style={[
              styles.btn,
              { backgroundColor: canRequest ? '#1877f2' : '#9bbcf7' },
            ]}
            disabled={!canRequest}
            onPress={createRideRequest}
          >
            <Text style={styles.btnText}>
              {loading ? 'Calculando…' : activeRide ? 'Carrera activa' : 'Solicitar'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.btn, styles.btnDark]} onPress={goHome}>
            <Text style={styles.btnText}>Volver al inicio</Text>
          </TouchableOpacity>
        </View>

        {(showCancel || showLive) && (
          <View style={styles.row2}>
            {showCancel && (
              <TouchableOpacity
                style={[
                  styles.btn,
                  styles.btnDanger,
                  { opacity: cancelling ? 0.7 : 1 },
                ]}
                disabled={cancelling}
                onPress={cancelActiveRide}
              >
                <Text style={[styles.btnText, { fontWeight: '800' }]}>
                  {cancelling ? 'Cancelando…' : 'Cancelar carrera'}
                </Text>
              </TouchableOpacity>
            )}

            {showLive && (
              <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={goToLiveRide}>
                <Text style={[styles.btnText, { fontWeight: '800' }]}>Ver viaje</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },

  header: { padding: 16, backgroundColor: '#1877f2' },
  headerTitle: { color: 'white', fontSize: 20, fontWeight: '700' },
  headerSubtitle: { color: 'white' },

  mapContainer: { flex: 1, position: 'relative' },
  map: { ...StyleSheet.absoluteFillObject, zIndex: 0 },

  loadingMap: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  footer: { padding: 16, backgroundColor: '#fff', zIndex: 100, elevation: 100 },

  activeRideCard: {
    backgroundColor: '#f2f4f7',
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  activeRideTitle: { fontWeight: '800', marginBottom: 4 },
  bold: { fontWeight: '700' },

  bannerWarn: {
    backgroundColor: '#FFF3CD',
    borderColor: '#FFEEBA',
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 10,
  },
  bannerWarnText: {
    color: '#856404',
    fontSize: 13,
    fontWeight: '600',
  },

  row: { flexDirection: 'row', gap: 10, marginTop: 12 },
  row2: { flexDirection: 'row', gap: 10, marginTop: 10 },

  btn: { flex: 1, padding: 14, borderRadius: 10 },
  btnText: { color: 'white', textAlign: 'center', fontWeight: '700' },

  btnPrimary: { backgroundColor: '#1877f2' },
  btnDark: { backgroundColor: '#555' },
  btnDanger: { backgroundColor: '#e74c3c' },
});
