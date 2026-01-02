// src/lib/location.js
import * as Location from 'expo-location';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { haversineKm, computeFare } from './fare';

let watcher = null;

export async function startRideTracking(rideId) {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new Error('Permiso de ubicación denegado');

  watcher = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.Highest, distanceInterval: 5, timeInterval: 2000 },
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      const now = Date.now();

      await runTransaction(db, async (tx) => {
        const ref = doc(db, 'rides', rideId);
        const snap = await tx.get(ref);
        if (!snap.exists()) return;

        const data = snap.data();
        if (data.status === 'finished') return;

        const path = Array.isArray(data.path) ? data.path : [];
        const prev = path[path.length - 1];
        const newPoint = { lat: latitude, lng: longitude, t: now };

        let km = data.km || 0;
        let minutes = data.minutes || 0;
        if (prev) km += haversineKm(prev, newPoint);
        minutes = (now - (data.startedAt || now)) / 60000;

        const currentFare = computeFare({ km, minutes });

        tx.update(ref, {
          path: [...path, newPoint],
          km,
          minutes,
          currentFare,
          status: 'ongoing',
          startedAt: data.startedAt || now,
          lastPointAt: serverTimestamp(),
        });
      });
    }
  );
}

export function stopRideTracking() {
  if (watcher) watcher.remove();
  watcher = null;
}
