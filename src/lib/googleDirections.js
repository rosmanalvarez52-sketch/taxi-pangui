// src/lib/googleDirections.js
import { decodePolyline } from './fare';

const REST_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_REST_KEY;

function toNum(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function getRoute({ origin, destination }) {
  if (!origin || !destination) throw new Error('Faltan origen/destino');
  if (!REST_KEY) throw new Error('Falta EXPO_PUBLIC_GOOGLE_MAPS_REST_KEY');

  const oLat = toNum(origin.lat);
  const oLng = toNum(origin.lng);
  const dLat = toNum(destination.lat);
  const dLng = toNum(destination.lng);

  if (oLat == null || oLng == null || dLat == null || dLng == null) {
    throw new Error('Origen/destino inválidos (lat/lng no numéricos)');
  }

  const params = new URLSearchParams({
    origin: `${oLat},${oLng}`,
    destination: `${dLat},${dLng}`,
    mode: 'driving',
    region: 'ec',
    language: 'es',
    key: REST_KEY,
  });

  const url = `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`;

  const res = await fetch(url);
  const data = await res.json();

  // Log útil para depuración
  if (data.status !== 'OK') {
    console.log('Directions status:', data.status, data.error_message || '');
  }

  if (data.status !== 'OK' || !data.routes?.length) {
    throw new Error(data.error_message || data.status || 'No se pudo obtener ruta');
  }

  const route = data.routes[0];
  const leg = route.legs?.[0];

  const meters = leg?.distance?.value || 0;
  const seconds = leg?.duration?.value || 0;

  const poly = route?.overview_polyline?.points;
  const coords = poly ? decodePolyline(poly) : [];

  return {
    distanceKm: meters / 1000,
    durationMin: Math.round(seconds / 60),
    polyline: poly,
    coords,
  };
}
