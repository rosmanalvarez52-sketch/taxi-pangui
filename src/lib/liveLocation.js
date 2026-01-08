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
const MIN_WRITE_MS = 1200; // 1.2s

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
 * Escribe (respetando throttle). Devuelve { wrote, shouldWaitMs }
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
 * Si cae dentro del throttle, espera y reintenta.
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

      if (!r.wrote && r.shouldWaitMs > 0) {
        await sleep(r.shouldWaitMs);

        // Si no llegó otro punto durante el sleep, re-usamos el mismo
        if (!pendingPoint) pendingPoint = p;
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

/**
 * Fuerza un punto actual inmediato.
 */
async function forceFreshPointNow(uid) {
  const p = await safeGetCurrentPosition();
  if (!p) return false;

  try {
    await writeDriverLocationQueued({
      uid,
      rideId: activeRideId,
      latitude: p.latitude,
      longitude: p.longitude,
    });
    return true;
  } catch (_) {
    return false;
  }
}

function startFallbackPolling(uid) {
  stopFallbackPolling();

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
    } catch (_) {}
  }, 5000);
}

function stopFallbackPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

/**
 * Inicia ubicación en vivo del CHOFER (si rideId cambia, forzamos envío inmediato)
 */
export async function startDriverLiveLocation(rideId = null) {
  const user = auth.currentUser;
  if (!user) {
    Alert.alert('Sesión', 'Debes iniciar sesión para enviar tu ubicación.');
    return;
  }

  activeRideId = rideId || null;

  const ok = await requestLocationPermissions();
  if (!ok) return;

  // al cambiar rideId, reseteamos throttle para enviar YA
  lastWriteMs = 0;

  // siempre fuerza primer punto actual
  await forceFreshPointNow(user.uid);

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
    } catch (e) {
      console.warn('⚠️ No se pudo actualizar rideId:', e?.message);
    }

    startFallbackPolling(user.uid);
    return;
  }

  try {
    const options = {
      accuracy:
        Platform.OS === 'android'
          ? Location.Accuracy.BestForNavigation
          : Location.Accuracy.High,
      timeInterval: 2000,
      distanceInterval: 0,
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
      } catch (e) {
        console.warn('⚠️ Error guardando liveLocation:', e?.message);
      }
    });

    startFallbackPolling(user.uid);

    if (!appStateSub) {
      appStateSub = AppState.addEventListener('change', async (st) => {
        if (st === 'active') {
          lastWriteMs = 0;
          await forceFreshPointNow(user.uid);
        }
      });
    }
  } catch (e) {
    console.warn('⚠️ No se pudo iniciar LiveLocation:', e?.message);
  }
}

export async function stopDriverLiveLocation() {
  activeRideId = null;

  stopFallbackPolling();

  if (locationSubscription) {
    try {
      locationSubscription.remove();
    } catch (_) {}
    locationSubscription = null;
  }

  if (appStateSub) {
    try {
      appStateSub.remove();
    } catch (_) {}
    appStateSub = null;
  }

  // marcar isDriving false al detener
  try {
    const uid = auth.currentUser?.uid;
    if (uid) {
      const liveRef = doc(db, 'liveLocations', uid);
      await setDoc(
        liveRef,
        { rideId: null, isDriving: false, updatedAt: serverTimestamp() },
        { merge: true }
      );
    }
  } catch (_) {}
}

/**
 * ✅ NUEVO: Pasajero escribe SU ubicación en liveLocations/{uid} (sin tocar rides)
 * Esto NO depende de reglas de rides, solo liveLocations.
 */
export async function writeMyLiveLocation({ rideId = null, isDriving = false, lat, lng }) {
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  const liveRef = doc(db, 'liveLocations', uid);
  await setDoc(
    liveRef,
    {
      uid,
      rideId: rideId || null,
      lat,
      lng,
      isDriving: !!isDriving, // para el pasajero será false, pero lo dejamos genérico
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * ✅ NUEVO: Escuchar ubicación en vivo de CUALQUIER usuario (driver o pasajero)
 */
export function subscribeToLiveLocation(userUid, callback) {
  if (!userUid) {
    console.warn('subscribeToLiveLocation: userUid no proporcionado');
    callback(null);
    return () => {};
  }

  const ref = doc(db, 'liveLocations', userUid);

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
          isDriving: !!data.isDriving,
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

/** Compatibilidad con código existente */
export function subscribeToDriverLocation(driverUid, callback) {
  return subscribeToLiveLocation(driverUid, callback);
}
