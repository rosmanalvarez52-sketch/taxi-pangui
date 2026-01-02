// src/lib/liveLocation.js
import * as Location from 'expo-location';
import { Alert, Platform, AppState } from 'react-native';
import { auth, db } from './firebase';
import { doc, setDoc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';

let locationSubscription = null;
let activeRideId = null;

// Fallback polling timer
let pollTimer = null;

// throttle para no escribir excesivo
let lastWriteMs = 0;
const MIN_WRITE_MS = 1200; // 1.2s (más fluido)

// lock simple para evitar escrituras en paralelo
let writing = false;
let pendingPoint = null;

// AppState subscription (para evitar listeners duplicados)
let appStateSub = null;

async function ensureLocationServicesEnabled() {
  try {
    const enabled = await Location.hasServicesEnabledAsync();
    if (!enabled) {
      Alert.alert(
        'Ubicación',
        'Activa el GPS/Ubicación del teléfono para enviar tu posición en tiempo real.'
      );
      return false;
    }
    return true;
  } catch (_) {
    return true;
  }
}

export async function requestLocationPermissions() {
  const okServices = await ensureLocationServicesEnabled();
  if (!okServices) return false;

  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert(
      'Ubicación',
      'Se requiere permiso de ubicación para enviar tu posición en tiempo real.'
    );
    return false;
  }
  return true;
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

/**
 * ✅ IMPORTANTE:
 * Antes: si estaba dentro del throttle, hacía return y PERDÍA la ubicación.
 * Ahora: devuelve { shouldWaitMs } para que la cola espere y luego escriba.
 */
async function writeDriverLocationNow({ uid, rideId, latitude, longitude }) {
  const now = Date.now();
  const elapsed = now - lastWriteMs;

  if (elapsed < MIN_WRITE_MS) {
    return { wrote: false, shouldWaitMs: MIN_WRITE_MS - elapsed };
  }

  lastWriteMs = now;

  // 1) liveLocations/{uid}
  const liveRef = doc(db, 'liveLocations', uid);
  await setDoc(
    liveRef,
    {
      uid,
      rideId: rideId || null,
      lat: latitude,
      lng: longitude,
      isDriving: !!rideId,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  // 2) rides/{rideId} (para que el pasajero vea el taxi)
  if (rideId) {
    const rideRef = doc(db, 'rides', rideId);
    await updateDoc(rideRef, {
      driverLocation: { lat: latitude, lng: longitude },
      driverLocationUpdatedAt: serverTimestamp(),
    });
  }

  return { wrote: true, shouldWaitMs: 0 };
}

/**
 * Cola: siempre conserva el ÚLTIMO punto.
 * Si cae dentro del throttle, espera y reintenta (no lo pierde).
 */
async function writeDriverLocationQueued(payload) {
  pendingPoint = payload;
  if (writing) return;

  writing = true;
  try {
    while (pendingPoint) {
      const p = pendingPoint;
      pendingPoint = null;

      const r = await writeDriverLocationNow(p);

      // Si el throttle dijo "espera", esperamos y reintentamos con el último punto conocido
      if (!r.wrote && r.shouldWaitMs > 0) {
        // durante esta espera puede entrar un pendingPoint nuevo; al final del sleep se usa el último
        await sleep(r.shouldWaitMs);

        // si durante el sleep NO llegó un pendingPoint nuevo, re-usamos el mismo p
        if (!pendingPoint) {
          pendingPoint = p;
        }
      }
    }
  } finally {
    writing = false;
  }
}

async function safeGetCurrentPosition() {
  try {
    const pos = await Location.getCurrentPositionAsync({
      accuracy:
        Platform.OS === 'android'
          ? Location.Accuracy.BestForNavigation
          : Location.Accuracy.High,
    });
    const { latitude, longitude } = pos.coords || {};
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { latitude, longitude };
  } catch (_) {
    return null;
  }
}

function startFallbackPolling(uid) {
  stopFallbackPolling();

  // Cada 5s forzamos un getCurrentPosition por si watchPosition “se duerme”
  pollTimer = setInterval(async () => {
    if (!uid) return;
    const p = await safeGetCurrentPosition();
    if (!p) return;

    try {
      await writeDriverLocationQueued({
        uid,
        rideId: activeRideId,
        latitude: p.latitude,
        longitude: p.longitude,
      });
      console.log(
        `🛰️ Poll -> (${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}) rideId=${activeRideId || 'null'}`
      );
    } catch (_) {}
  }, 5000);
}

function stopFallbackPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export async function startDriverLiveLocation(rideId = null) {
  const user = auth.currentUser;
  if (!user) {
    Alert.alert('Sesión', 'Debes iniciar sesión para enviar tu ubicación.');
    return;
  }

  // Siempre actualiza ride activo
  activeRideId = rideId || null;

  const ok = await requestLocationPermissions();
  if (!ok) return;

  // Si ya existe watcher, solo actualiza metadatos y sigue
  if (locationSubscription) {
    try {
      const liveRef = doc(db, 'liveLocations', user.uid);
      await setDoc(
        liveRef,
        {
          uid: user.uid,
          rideId: activeRideId,
          isDriving: !!activeRideId,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      console.log('🔁 LiveLocation ya activo: rideId actualizado a', activeRideId);
    } catch (e) {
      console.warn('⚠️ No se pudo actualizar rideId:', e?.message);
    }

    startFallbackPolling(user.uid);
    return;
  }

  try {
    // Primer envío inmediato
    const first = await safeGetCurrentPosition();
    if (first) {
      await writeDriverLocationQueued({
        uid: user.uid,
        rideId: activeRideId,
        latitude: first.latitude,
        longitude: first.longitude,
      });
      console.log('📌 Primer envío ubicación OK');
    }

    const options = {
      accuracy:
        Platform.OS === 'android'
          ? Location.Accuracy.BestForNavigation
          : Location.Accuracy.High,

      timeInterval: 2000,
      distanceInterval: 0, // fuerza callbacks (lo controlamos con throttle + cola)
      mayShowUserSettingsDialog: true,
    };

    if (Platform.OS === 'android') {
      options.foregroundService = {
        notificationTitle: 'Taxi en servicio',
        notificationBody: 'Enviando ubicación en tiempo real…',
      };
    }

    locationSubscription = await Location.watchPositionAsync(options, async (loc) => {
      const { latitude, longitude } = loc.coords || {};
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

      try {
        await writeDriverLocationQueued({
          uid: user.uid,
          rideId: activeRideId,
          latitude,
          longitude,
        });

        console.log(
          `📍 Watch -> (${latitude.toFixed(5)}, ${longitude.toFixed(5)}) rideId=${activeRideId || 'null'}`
        );
      } catch (e) {
        console.warn('⚠️ Error guardando liveLocation:', e?.message);
      }
    });

    // Fallback polling ON
    startFallbackPolling(user.uid);

    // ✅ AppState listener único (sin duplicar)
    if (!appStateSub) {
      appStateSub = AppState.addEventListener('change', async (st) => {
        if (st === 'active') {
          const p = await safeGetCurrentPosition();
          if (!p) return;
          try {
            await writeDriverLocationQueued({
              uid: user.uid,
              rideId: activeRideId,
              latitude: p.latitude,
              longitude: p.longitude,
            });
          } catch (_) {}
        }
      });
    }

    console.log('✅ LiveLocation iniciado uid=', user.uid, 'rideId=', activeRideId);
  } catch (e) {
    console.warn('⚠️ No se pudo iniciar LiveLocation:', e?.message);
  }
}

export function stopDriverLiveLocation() {
  activeRideId = null;

  stopFallbackPolling();

  if (locationSubscription) {
    try {
      locationSubscription.remove();
    } catch (_) {}
    locationSubscription = null;
    console.log('⏹ LiveLocation detenido');
  }

  // ✅ limpiar AppState listener
  if (appStateSub) {
    try {
      appStateSub.remove();
    } catch (_) {}
    appStateSub = null;
  }
}

/** ✅ Necesario para PassengerHome.js (y para debug) */
export function subscribeToDriverLocation(driverUid, callback) {
  if (!driverUid) {
    console.warn('subscribeToDriverLocation: driverUid no proporcionado');
    callback(null);
    return () => {};
  }

  const ref = doc(db, 'liveLocations', driverUid);

  const unsub = onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) callback(null);
      else {
        const data = snap.data();
        callback({
          lat: data.lat,
          lng: data.lng,
          rideId: data.rideId || null,
          updatedAt: data.updatedAt || null,
        });
      }
    },
    (err) => {
      console.warn('⚠️ Error escuchando liveLocation:', err?.message);
      callback(null);
    }
  );

  return unsub;
}
