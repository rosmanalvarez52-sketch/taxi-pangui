// src/lib/googleDirections.js
import { Platform } from 'react-native';
import { decodePolyline } from './fare';

const RAW_BASE = (process.env.EXPO_PUBLIC_API_BASE_URL || '').trim();
const API_BASE = RAW_BASE.replace(/\/$/, ''); // sin slash final

function toNum(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isLocalhostWeb() {
  return (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  );
}

/**
 * ✅ En Android/iOS: URL absoluta a Vercel SIEMPRE.
 * ✅ En web local: también a Vercel.
 * ✅ En web producción: /api del mismo host.
 */
function buildDirectionsUrl(params) {
  if (Platform.OS !== 'web') {
    if (!API_BASE) {
      throw new Error('Falta EXPO_PUBLIC_API_BASE_URL (ej: https://taxi-pangui.vercel.app)');
    }
    return `${API_BASE}/api/directions?${params.toString()}`;
  }

  if (isLocalhostWeb()) {
    if (!API_BASE) {
      throw new Error('Falta EXPO_PUBLIC_API_BASE_URL (ej: https://taxi-pangui.vercel.app)');
    }
    return `${API_BASE}/api/directions?${params.toString()}`;
  }

  return `/api/directions?${params.toString()}`;
}

async function safeJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return {
      status: 'BAD_RESPONSE',
      error_message: (text || '').slice(0, 250) || 'Respuesta no JSON',
    };
  }
}

/**
 * ✅ Ruta por calles (OSRM) – funciona bien en web y mobile (por CORS permitido).
 * Devuelve muchos puntos siguiendo calles (NO recta).
 */
async function getRouteViaOSRM({ origin, destination }) {
  const oLat = toNum(origin.lat);
  const oLng = toNum(origin.lng);
  const dLat = toNum(destination.lat);
  const dLng = toNum(destination.lng);

  if (oLat == null || oLng == null || dLat == null || dLng == null) {
    throw new Error('Origen/destino inválidos para OSRM');
  }

  // OSRM: lon,lat
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${oLng},${oLat};${dLng},${dLat}` +
    `?overview=full&geometries=geojson&steps=false`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  let res;
  try {
    res = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);

  const data = await res.json().catch(() => null);
  if (!data || data.code !== 'Ok' || !data.routes?.length) {
    throw new Error('OSRM sin rutas');
  }

  const r = data.routes[0];
  const meters = typeof r.distance === 'number' ? r.distance : 0;
  const seconds = typeof r.duration === 'number' ? r.duration : 0;

  const coordsGeo = r.geometry?.coordinates || []; // [[lng,lat],...]
  const coords = coordsGeo
    .map((pair) => ({
      latitude: toNum(pair?.[1]),
      longitude: toNum(pair?.[0]),
    }))
    .filter((p) => p.latitude != null && p.longitude != null);

  if (coords.length < 4) throw new Error('OSRM coords insuficientes');

  return {
    distanceKm: meters / 1000,
    durationMin: Math.max(1, Math.round(seconds / 60)),
    polyline: null,
    coords,
    provider: 'osrm',
  };
}

export async function getRoute({ origin, destination }) {
  if (!origin || !destination) throw new Error('Faltan origen/destino');

  const oLat = toNum(origin.lat);
  const oLng = toNum(origin.lng);
  const dLat = toNum(destination.lat);
  const dLng = toNum(destination.lng);

  if (oLat == null || oLng == null || dLat == null || dLng == null) {
    throw new Error('Origen/destino inválidos (lat/lng no numéricos)');
  }

  // ✅ 1) Intento Google (via tu /api/directions)
  try {
    const params = new URLSearchParams({
      origin: `${oLat},${oLng}`,
      destination: `${dLat},${dLng}`,
      mode: 'driving',
    });

    const url = buildDirectionsUrl(params);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let res;
    try {
      res = await fetch(url, { signal: controller.signal });
    } catch (e) {
      if (e?.name === 'AbortError') throw new Error('Timeout consultando Google (API).');
      throw e;
    } finally {
      clearTimeout(timeout);
    }

    const data = await safeJson(res);

    if (!res.ok) {
      throw new Error(data?.error_message || `Google API HTTP ${res.status}`);
    }

    if (data.status !== 'OK' || !data.routes?.length) {
      throw new Error(data.error_message || data.status || 'Google sin rutas');
    }

    const route = data.routes[0];
    const leg = route.legs?.[0];

    const meters = leg?.distance?.value || 0;
    const seconds = leg?.duration?.value || 0;

    const poly = route?.overview_polyline?.points;
    const coords = poly ? decodePolyline(poly) : [];

    // ✅ MEJORA CLAVE WEB:
    // Si por cualquier razón Google devuelve pocos puntos, NO dibujes recta: fuerza OSRM.
    if (!coords || coords.length < 4) {
      const osrm = await getRouteViaOSRM({ origin, destination });
      return osrm;
    }

    return {
      distanceKm: meters / 1000,
      durationMin: Math.max(1, Math.round(seconds / 60)),
      polyline: poly,
      coords,
      provider: 'google',
    };
  } catch (e) {
    // ✅ 2) Fallback OSRM (si Google falla o no retorna ruta útil)
    const osrm = await getRouteViaOSRM({ origin, destination });
    return osrm;
  }
}
