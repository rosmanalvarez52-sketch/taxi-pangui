// src/screens/admin/AssignRide.js
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { auth, db } from '../../lib/firebase';
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  onSnapshot, // ✅
} from 'firebase/firestore';
import { goToAppStart } from '../../lib/goHome';

// ✅ Mapa reutilizable (web + native)
import MapView, { PROVIDER_GOOGLE } from '../../components/MapView';

// ✅ Direcciones (para dibujar polyline si no existe ride.route)
import { getRoute } from '../../lib/googleDirections';

// ✅ Live location del chofer
import { startDriverLiveLocation } from '../../lib/liveLocation';

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

function hasLatLng(p) {
  const lat = toNumber(p?.lat);
  const lng = toNumber(p?.lng);
  return lat !== null && lng !== null;
}

function normStr(v) {
  const s = typeof v === 'string' ? v.trim() : '';
  return s.length ? s : null;
}

function normStatus(v) {
  return typeof v === 'string' ? v.trim().toLowerCase() : '';
}

export default function AssignRide() {
  const route = useRoute();
  const navigation = useNavigation();
  const rideId = route.params?.rideId || null;

  const [ride, setRide] = useState(null);
  const [driverName, setDriverName] = useState('');
  const [driverPlate, setDriverPlate] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ✅ Ruta calculada para mostrar en el mapa (si el ride no trae route)
  const [localRoute, setLocalRoute] = useState(null); // { coords, distanceKm, durationMin }

  /** ✅ 1) SUSCRIPCIÓN EN TIEMPO REAL A rides/{rideId}  */
  useEffect(() => {
    let unsub = null;
    let cancelled = false;

    (async () => {
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
          Alert.alert('Sesión', 'Debes iniciar sesión como administrador.');
          navigation.goBack();
          return;
        }

        if (!rideId) {
          Alert.alert('Error', 'No se recibió el ID del viaje.');
          navigation.goBack();
          return;
        }

        // ✅ Prefill chofer desde users/{uid} (si existe) (se hace una vez)
        try {
          const adminRef = doc(db, 'users', currentUser.uid);
          const adminSnap = await getDoc(adminRef);
          if (adminSnap.exists()) {
            const d = adminSnap.data();
            if (d.driverName) setDriverName(String(d.driverName));
            else if (d.names || d.surnames) {
              setDriverName(`${d.names || ''} ${d.surnames || ''}`.trim());
            }
            if (d.driverPlate) setDriverPlate(String(d.driverPlate));
          }
        } catch (_) {}

        // ✅ Escucha live del ride (esto es lo que habilita el movimiento en tiempo real)
        const rideRef = doc(db, 'rides', rideId);
        unsub = onSnapshot(
          rideRef,
          (snap) => {
            if (!snap.exists()) {
              setRide(null);
              setLoading(false);
              return;
            }
            const data = snap.data();
            setRide({ id: snap.id, ...data });
            setLoading(false);
          },
          (err) => {
            console.log(err);
            setLoading(false);
          }
        );
      } catch (e) {
        console.log(e);
        Alert.alert('Error', e?.message || 'No se pudo cargar la solicitud.');
        navigation.goBack();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (typeof unsub === 'function') unsub();
    };
  }, [rideId, navigation]);

  const status = normStatus(ride?.status);
  const isAssigned = status === 'assigned';
  const isFinished = status === 'finished';
  const isCancelled = status === 'cancelled';

  /** ✅ 2) Re-enganche del tracking si ya está asignada y soy el driver */
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    if (!ride?.id) return;

    if (normStatus(ride.status) === 'assigned' && ride.driverId === uid) {
      startDriverLiveLocation(ride.id);
    }
  }, [ride?.id, ride?.status, ride?.driverId]);

  /** ✅ 3) Construir ruta para mapa (solo si falta route) */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (!ride) return;
        if (normStatus(ride.status) !== 'assigned') return;

        // Si ya existe route guardada, úsala
        if (Array.isArray(ride?.route?.coords) && ride.route.coords.length) {
          if (!cancelled) {
            setLocalRoute({
              coords: ride.route.coords,
              distanceKm: ride.route.distanceKm ?? null,
              durationMin: ride.route.durationMin ?? null,
            });
          }
          return;
        }

        if (!hasLatLng(ride.origin) || !hasLatLng(ride.destination)) return;

        const r = await getRoute({
          origin: { lat: ride.origin.lat, lng: ride.origin.lng },
          destination: { lat: ride.destination.lat, lng: ride.destination.lng },
        });

        if (!cancelled) setLocalRoute(r);
      } catch (e) {
        console.log('No se pudo obtener ruta para mapa (AssignRide):', e?.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ride?.id, ride?.status, ride?.origin, ride?.destination, ride?.route]);

  const dist =
    typeof ride?.distanceKm === 'number' ? `${ride.distanceKm.toFixed(2)} km` : '—';

  const price =
    typeof ride?.price === 'number' ? `$ ${ride.price.toFixed(2)}` : '—';

  /** ✅ Pasajero (para mostrar siempre) */
  const passengerInfo = useMemo(() => {
    if (!ride) return { name: '—', phone: '—', uid: null };

    const name =
      normStr(ride?.passengerName) ||
      normStr(ride?.passenger?.name) ||
      '—';

    const phone =
      normStr(ride?.passengerPhone) ||
      normStr(ride?.passenger?.phone) ||
      '—';

    const uid = ride?.passengerId || ride?.passenger?.uid || null;

    return { name, phone, uid };
  }, [ride]);

  const initialRegion = useMemo(() => {
    if (!ride?.origin || !ride?.destination) return null;
    if (!hasLatLng(ride.origin) || !hasLatLng(ride.destination)) return null;

    const lat1 = ride.origin.lat;
    const lng1 = ride.origin.lng;
    const lat2 = ride.destination.lat;
    const lng2 = ride.destination.lng;

    return {
      latitude: (lat1 + lat2) / 2,
      longitude: (lng1 + lng2) / 2,
      latitudeDelta: 0.08,
      longitudeDelta: 0.08,
    };
  }, [ride]);

  /** ✅ Datos para MapView con "rides" (AHORA incluye driverLocation en vivo) */
  const ridesForMap = useMemo(() => {
    if (!ride) return [];
    if (!isAssigned) return [];
    if (!hasLatLng(ride.origin) || !hasLatLng(ride.destination)) return [];

    const routeToUse =
      Array.isArray(ride?.route?.coords) && ride.route.coords.length
        ? ride.route
        : localRoute && Array.isArray(localRoute.coords)
        ? {
            coords: localRoute.coords,
            distanceKm: localRoute.distanceKm,
            durationMin: localRoute.durationMin,
          }
        : null;

    return [
      {
        id: ride.id,
        status: ride.status,
        origin: ride.origin,
        destination: ride.destination,
        route: routeToUse,

        // ✅ CLAVE: esto permite que MapView.web dibuje el taxi en tiempo real
        driverLocation: ride.driverLocation || null,

        // (opcional si más adelante guardas passengerLocation en rides)
        passengerLocation: ride.passengerLocation || null,
      },
    ];
  }, [ride, localRoute, isAssigned]);

  async function onAssign() {
    if (saving) return;

    const currentUser = auth.currentUser;
    if (!currentUser) return Alert.alert('Sesión', 'Debes iniciar sesión como administrador.');
    if (!ride) return Alert.alert('Error', 'No se pudo encontrar la solicitud.');
    if (!driverName.trim() || !driverPlate.trim()) {
      return Alert.alert('Datos incompletos', 'Ingresa el nombre del chofer y la placa del vehículo.');
    }

    setSaving(true);
    try {
      const rideRef = doc(db, 'rides', ride.id);

      const snap = await getDoc(rideRef);
      if (!snap.exists()) throw new Error('La solicitud ya no existe.');

      const currentData = snap.data();
      const currentStatus = normStatus(currentData.status || 'open');

      if (['finished', 'cancelled'].includes(currentStatus)) {
        throw new Error(`No se puede asignar un viaje en estado "${currentStatus}".`);
      }

      const pickupEtaMin =
        typeof currentData.etaMin === 'number'
          ? Math.max(3, Math.round(currentData.etaMin * 0.3))
          : null;

      // Intentar leer última ubicación del chofer
      let driverLocation = null;
      try {
        const liveRef = doc(db, 'liveLocations', currentUser.uid);
        const liveSnap = await getDoc(liveRef);
        if (liveSnap.exists()) {
          const ld = liveSnap.data();
          if (typeof ld.lat === 'number' && typeof ld.lng === 'number') {
            driverLocation = { lat: ld.lat, lng: ld.lng };
          }
        }
      } catch (_) {}

      const passengerName =
        normStr(currentData?.passengerName) ||
        normStr(currentData?.passenger?.name) ||
        null;

      const passengerPhone =
        normStr(currentData?.passengerPhone) ||
        normStr(currentData?.passenger?.phone) ||
        null;

      const passengerUid = currentData?.passengerId || currentData?.passenger?.uid || null;

      await updateDoc(rideRef, {
        status: 'assigned',
        driverId: currentUser.uid,
        driverName: driverName.trim(),
        driverPlate: driverPlate.trim(),
        driver: { uid: currentUser.uid, name: driverName.trim(), plate: driverPlate.trim() },

        passenger: { uid: passengerUid, name: passengerName, phone: passengerPhone },
        passengerName,
        passengerPhone,

        acceptedAt: serverTimestamp(),
        pickupEtaMin,
        driverLocation: driverLocation || null,
        driverLocationUpdatedAt: serverTimestamp(),
      });

      // ✅ Iniciar tracking (y dejarlo activo)
      try {
        await startDriverLiveLocation(ride.id);
      } catch (_) {}

      Alert.alert(
        'Asignado',
        `Carrera aceptada.\nPasajero: ${passengerName || '—'}\nChofer: ${driverName.trim()} (${driverPlate.trim()}).`
      );
    } catch (e) {
      console.log(e);
      Alert.alert('Error', e?.message || 'No se pudo asignar el viaje.');
    } finally {
      setSaving(false);
    }
  }

  async function onMarkFinished() {
    if (saving) return;

    const currentUser = auth.currentUser;
    if (!currentUser) return Alert.alert('Sesión', 'Debes iniciar sesión como administrador.');
    if (!ride) return Alert.alert('Error', 'No se pudo encontrar la solicitud.');

    if (normStatus(ride.status) !== 'assigned') {
      return Alert.alert('Estado inválido', 'Solo puedes marcar como completada una carrera que ya fue asignada.');
    }

    Alert.alert('Finalizar carrera', '¿Confirmas que esta carrera ya terminó?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sí, finalizar',
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          try {
            const rideRef = doc(db, 'rides', ride.id);
            await updateDoc(rideRef, {
              status: 'finished',
              finishedAt: serverTimestamp(),
            });

            Alert.alert('Listo', 'La carrera ha sido marcada como completada.');
            navigation.goBack();
          } catch (e) {
            console.log(e);
            Alert.alert('Error', e?.message || 'No se pudo completar el viaje.');
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
        <Text>Cargando solicitud…</Text>
      </View>
    );
  }

  if (!ride) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>No se encontró la solicitud.</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
        <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 8 }}>
          Asignar carrera
        </Text>

        <Text style={{ marginBottom: 4 }}>
          <Text style={{ fontWeight: '700' }}>ID:</Text> {ride.id}
        </Text>

        <Text style={{ marginBottom: 4 }}>
          <Text style={{ fontWeight: '700' }}>Estado actual:</Text> {ride.status || '—'}
        </Text>

        <Text style={{ marginBottom: 4 }}>
          <Text style={{ fontWeight: '700' }}>Distancia:</Text> {dist}
        </Text>

        <Text style={{ marginBottom: 10 }}>
          <Text style={{ fontWeight: '700' }}>Precio estimado:</Text> {price}
        </Text>

        {/* ✅ Datos del pasajero */}
        <View
          style={{
            backgroundColor: '#f2f4f7',
            padding: 10,
            borderRadius: 10,
            marginBottom: 12,
          }}
        >
          <Text style={{ fontWeight: '800', marginBottom: 4 }}>Pasajero</Text>
          <Text>
            Nombre: <Text style={{ fontWeight: '700' }}>{passengerInfo.name}</Text>
          </Text>
          <Text>
            Teléfono: <Text style={{ fontWeight: '700' }}>{passengerInfo.phone}</Text>
          </Text>
        </View>

        {/* ✅ Chat */}
        {ride?.id && (
          <TouchableOpacity
            style={{
              marginBottom: 12,
              backgroundColor: '#1877f2',
              padding: 12,
              borderRadius: 10,
            }}
            onPress={() => navigation.navigate('ChatRide', { rideId: ride.id })}
          >
            <Text style={{ color: 'white', textAlign: 'center', fontWeight: '800' }}>
              Abrir chat
            </Text>
          </TouchableOpacity>
        )}

        {/* ✅ BOTÓN COMPLETAR */}
        {isAssigned && (
          <View style={{ marginBottom: 12 }}>
            <Button
              title={saving ? 'Guardando…' : 'Marcar carrera como completada'}
              color="#4CAF50"
              onPress={onMarkFinished}
              disabled={saving}
            />
          </View>
        )}

        {/* ✅ MAPA SOLO CUANDO YA SE ACEPTÓ (assigned) */}
        {isAssigned && initialRegion && (
          <View style={{ marginTop: 8, marginBottom: 12 }}>
            <Text style={{ fontWeight: '700', marginBottom: 6 }}>Ruta de la carrera</Text>

            <View
              style={{
                height: 260,
                borderRadius: 12,
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: '#e6e6e6',
                backgroundColor: '#fafafa',
              }}
            >
              <MapView
                style={{ flex: 1 }}
                provider={PROVIDER_GOOGLE}
                initialRegion={initialRegion}
                rides={ridesForMap} // ✅ ahora se actualiza con onSnapshot
              />
            </View>

            {(localRoute?.distanceKm || localRoute?.durationMin) && (
              <Text style={{ marginTop: 8, opacity: 0.75 }}>
                {localRoute?.distanceKm != null
                  ? `Distancia ruta: ${localRoute.distanceKm.toFixed(2)} km`
                  : ''}
                {localRoute?.durationMin != null ? `  ·  Tiempo estimado: ${localRoute.durationMin} min` : ''}
              </Text>
            )}
          </View>
        )}

        <Text style={{ fontWeight: '700', marginTop: 8, marginBottom: 4 }}>
          Datos del chofer
        </Text>

        <TextInput
          placeholder="Nombre del chofer"
          value={driverName}
          onChangeText={setDriverName}
          style={{
            borderWidth: 1,
            borderColor: '#ccc',
            borderRadius: 8,
            padding: 10,
            marginBottom: 8,
          }}
        />

        <TextInput
          placeholder="Placa (ej. ABC-1234)"
          value={driverPlate}
          onChangeText={setDriverPlate}
          autoCapitalize="characters"
          style={{
            borderWidth: 1,
            borderColor: '#ccc',
            borderRadius: 8,
            padding: 10,
            marginBottom: 16,
          }}
        />

        <Button
          title={
            saving
              ? 'Asignando…'
              : isAssigned
              ? 'Carrera asignada'
              : isFinished || isCancelled
              ? `Carrera ${ride.status}`
              : 'Aceptar carrera'
          }
          onPress={onAssign}
          disabled={saving || isFinished || isCancelled || isAssigned}
        />

        <TouchableOpacity
          style={{
            marginTop: 18,
            backgroundColor: '#555',
            padding: 12,
            borderRadius: 10,
          }}
          onPress={() => goToAppStart(navigation)}
        >
          <Text style={{ color: 'white', textAlign: 'center', fontWeight: '700' }}>
            Salir al inicio
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
