// src/screens/PassengerHome.js
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Alert,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
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

import { subscribeToDriverLocation } from '../lib/liveLocation';
import { goToAppStart } from '../lib/goHome';

/** =========================
 *  Utils para ETA aproximado
 *  ========================= */
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

// ✅ Tarifa mínima (configurable)
const MIN_FARE = 1.25;

// ✅ redondeo seguro a 2 decimales
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
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

  // ✅ datos del pasajero (para guardarlos en rides)
  const [passengerProfile, setPassengerProfile] = useState({
    name: null,
    phone: null,
  });

  // ✅ carrera activa del pasajero (open/searching/assigned)
  const [activeRide, setActiveRide] = useState(null);
  const [loadingActiveRide, setLoadingActiveRide] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  const notifiedRidesRef = useRef(new Set());
  const driverUnsubRef = useRef(null);
  const lastPickupEtaRef = useRef(null);
  const lastNotifyAtRef = useRef(0);

  // ✅ NUEVO: watcher de ubicación del pasajero (para origin real)
  const passengerWatchRef = useRef(null);
  const regionLockedRef = useRef(false); // evita “saltos” de cámara constantes

  /** =====================
   *  Cargar perfil pasajero
   *  ===================== */
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

  /** =====================
   *  ✅ Ubicación del pasajero en tiempo real
   *  - Esto corrige: origin fijo/inexacto
   *  ===================== */
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Ubicación', 'Permiso de ubicación denegado.');
          return;
        }

        // limpiar watcher anterior si existe
        try {
          if (passengerWatchRef.current) {
            passengerWatchRef.current.remove();
            passengerWatchRef.current = null;
          }
        } catch (_) {}

        // ✅ primer fix inmediato con alta precisión (mejor que {})
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

            // setear región inicial solo una vez (para no estar “siguiendo” siempre)
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

        // ✅ watcher continuo (actualiza origin real)
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
          (pos) => {
            if (!mounted) return;
            const { latitude, longitude } = pos.coords || {};
            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

            setOrigin({ lat: latitude, lng: longitude });

            // Si todavía no hay region (por ejemplo en inicio), la colocamos
            if (!regionLockedRef.current) {
              regionLockedRef.current = true;
              setRegion({
                latitude,
                longitude,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
              });
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
  }, []);

  /** ==========================================
   *  Escuchar carrera activa del pasajero
   *  ========================================== */
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
      where('status', 'in', ['open', 'searching', 'assigned']),
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

  /** ==========================================
   *  Notificaciones cuando pasa a "assigned"
   *  + ETA pickup en vivo opcional
   *  ========================================== */
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
            const status = data.status || 'open';

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

              // OJO: aquí estás calculando ETA hacia data.origin fijo.
              // Eso está OK para notificación, pero el tracking real lo hace RideLive con passengerLoc.
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

            if (status === 'finished' || status === 'cancelled') {
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

  /** =====================
   *  Elegir destino
   *  ===================== */
  const onLongPressMap = (e) => {
    if (activeRide) return;
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setDestination({ lat: latitude, lng: longitude });
  };

  /** =====================
   *  Calcular ruta
   *  ===================== */
  useEffect(() => {
    if (!origin || !destination) return;

    (async () => {
      try {
        setLoading(true);
        const r = await getRoute({ origin, destination });
        setPolyline(r.coords || []);
        setDistanceKm(r.distanceKm);
        setEtaMin(r.durationMin);
      } catch (err) {
        console.log(err);
        Alert.alert('Ruta', 'Error al calcular la ruta.');
        setPolyline([]);
        setDistanceKm(null);
        setEtaMin(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [origin, destination]);

  /** =====================
   *  ✅ Precio con mínimo $1.25
   *  ===================== */
  const price = useMemo(() => {
    if (!distanceKm) return null;

    const raw = fareByDistance(distanceKm);
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;

    const finalPrice = Math.max(MIN_FARE, raw);
    return round2(finalPrice);
  }, [distanceKm]);

  async function hasActiveRide(uid) {
    const activeStatuses = ['open', 'assigned', 'searching'];
    const q = query(
      collection(db, 'rides'),
      where('passengerId', '==', uid),
      where('status', 'in', activeStatuses)
    );
    const snap = await getDocs(q);
    return !snap.empty;
  }

  /** =====================
   *  ✅ Obtener ubicación “buena” al pedir taxi
   *  ===================== */
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

  /** =====================
   *  Crear solicitud
   *  ===================== */
  const createRideRequest = async () => {
    try {
      if (!origin || !destination || !price) {
        throw new Error('Completa origen, destino y espera el cálculo de precio.');
      }
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error('Debes iniciar sesión.');

      const already = await hasActiveRide(uid);
      if (already) {
        throw new Error(
          'Ya tienes una carrera activa. Espera a que se complete o se cancele antes de solicitar otra.'
        );
      }

      // ✅ refrescar origin real antes de guardar (clave)
      const freshOrigin = await getFreshPassengerOrigin();
      if (!freshOrigin) throw new Error('No se pudo obtener tu ubicación actual.');

      // Datos del pasajero para el taxista
      const passengerName = passengerProfile?.name || null;
      const passengerPhone = passengerProfile?.phone || null;

      const ref = await addDoc(collection(db, 'rides'), {
        passengerId: uid,

        passengerName,
        passengerPhone,

        passenger: {
          uid,
          name: passengerName,
          phone: passengerPhone,
        },

        origin: freshOrigin, // ✅ ORIGEN REAL
        destination,
        distanceKm,
        price,
        etaMin,
        status: 'open',
        createdAt: serverTimestamp(),
        route: polyline?.length ? { coords: polyline } : null,
      });

      Alert.alert('Solicitud enviada', `Precio estimado: $${price}\nId: ${ref.id}`);
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };

  /** =====================
   *  Cancelar carrera
   *  ===================== */
  const cancelActiveRide = async () => {
    if (cancelling) return;
    if (!activeRide?.id) return;

    const st = activeRide.status || 'open';
    if (!(st === 'open' || st === 'searching')) {
      return Alert.alert(
        'No disponible',
        'Solo puedes cancelar si la carrera aún está buscando taxi.'
      );
    }

    Alert.alert(
      'Cancelar carrera',
      '¿Seguro que deseas cancelar esta carrera?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sí, cancelar',
          style: 'destructive',
          onPress: async () => {
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

              Alert.alert('Listo', 'Tu carrera fue cancelada. Ya puedes solicitar otra.');
            } catch (e) {
              console.log(e);
              Alert.alert('Error', e?.message || 'No se pudo cancelar la carrera.');
            } finally {
              setCancelling(false);
            }
          },
        },
      ]
    );
  };

  /** =====================
   *  Ver viaje (RideLive)
   *  ===================== */
  const goToLiveRide = () => {
    if (!activeRide?.id) return;
    navigation.navigate('RideLive', { rideId: activeRide.id });
  };

  const canRequest = !activeRide && !!origin && !!destination && !!price && !loading;
  const showCancel =
    !!activeRide && (activeRide.status === 'open' || activeRide.status === 'searching');
  const showLive = !!activeRide && activeRide.status === 'assigned';

  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: 16, backgroundColor: '#1877f2' }}>
        <Text style={{ color: 'white', fontSize: 20, fontWeight: '700' }}>
          Solicitar Taxi
        </Text>

        <Text style={{ color: 'white' }}>
          {activeRide
            ? 'Tienes una carrera activa. Revisa el estado abajo.'
            : 'Mantén presionado el mapa para elegir el destino'}
        </Text>
      </View>

      {region ? (
        <MapView
          style={{ flex: 1 }}
          provider={PROVIDER_GOOGLE}
          initialRegion={region}
          onLongPress={onLongPressMap}
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

          {polyline.length > 0 && (
            <Polyline
              coordinates={polyline.map((p) => ({
                latitude: p.latitude,
                longitude: p.longitude,
              }))}
              strokeWidth={4}
              strokeColor="#1877f2"
            />
          )}
        </MapView>
      ) : (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" />
          <Text>Obteniendo tu ubicación…</Text>
        </View>
      )}

      <View style={{ padding: 16 }}>
        {loadingActiveRide ? (
          <Text>Verificando carrera activa…</Text>
        ) : activeRide ? (
          <View
            style={{
              backgroundColor: '#f2f4f7',
              padding: 12,
              borderRadius: 10,
              marginBottom: 12,
            }}
          >
            <Text style={{ fontWeight: '800', marginBottom: 4 }}>
              Carrera activa
            </Text>
            <Text>
              Estado:{' '}
              <Text style={{ fontWeight: '700' }}>
                {activeRide.status}
              </Text>
            </Text>
            <Text>
              Chofer:{' '}
              <Text style={{ fontWeight: '700' }}>
                {activeRide.driverName || activeRide.driver?.name || '—'}
              </Text>
            </Text>
            <Text>
              Placa:{' '}
              <Text style={{ fontWeight: '700' }}>
                {activeRide.driverPlate || activeRide.driver?.plate || '—'}
              </Text>
            </Text>
          </View>
        ) : null}

        <Text>Distancia: {distanceKm ? `${distanceKm.toFixed(2)} km` : '—'}</Text>
        <Text>ETA: {etaMin ? `${etaMin} min` : '—'}</Text>
        <Text>
          Precio: {price ? `$${price}` : '—'}{' '}
          {price ? `(mínimo $${MIN_FARE.toFixed(2)})` : ''}
        </Text>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <TouchableOpacity
            style={{
              flex: 1,
              backgroundColor: canRequest ? '#1877f2' : '#9bbcf7',
              padding: 14,
              borderRadius: 10,
            }}
            disabled={!canRequest}
            onPress={createRideRequest}
          >
            <Text style={{ color: 'white', textAlign: 'center', fontWeight: '700' }}>
              {loading ? 'Calculando…' : activeRide ? 'Carrera activa' : 'Solicitar'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{
              flex: 1,
              backgroundColor: '#555',
              padding: 14,
              borderRadius: 10,
            }}
            onPress={() => goToAppStart(navigation)}
          >
            <Text style={{ color: 'white', textAlign: 'center', fontWeight: '700' }}>
              Volver al inicio
            </Text>
          </TouchableOpacity>
        </View>

        {(showCancel || showLive) && (
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            {showCancel && (
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: '#e74c3c',
                  padding: 14,
                  borderRadius: 10,
                  opacity: cancelling ? 0.7 : 1,
                }}
                disabled={cancelling}
                onPress={cancelActiveRide}
              >
                <Text style={{ color: 'white', textAlign: 'center', fontWeight: '800' }}>
                  {cancelling ? 'Cancelando…' : 'Cancelar carrera'}
                </Text>
              </TouchableOpacity>
            )}

            {showLive && (
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: '#1877f2',
                  padding: 14,
                  borderRadius: 10,
                }}
                onPress={goToLiveRide}
              >
                <Text style={{ color: 'white', textAlign: 'center', fontWeight: '800' }}>
                  Ver viaje
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </View>
  );
}
