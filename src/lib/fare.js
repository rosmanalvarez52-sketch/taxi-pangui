// src/lib/fare.js

// Haversine en km
export function distanceKm(a, b) {
  if (!a || !b) return 0;
  const { lat: lat1, lng: lng1 } = a ?? {};
  const { lat: lat2, lng: lng2 } = b ?? {};
  if (
    typeof lat1 !== 'number' ||
    typeof lng1 !== 'number' ||
    typeof lat2 !== 'number' ||
    typeof lng2 !== 'number'
  )
    return 0;

  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const la1 = toRad(lat1);
  const la2 = toRad(lat2);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;

  const km = 2 * R * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
  return Number.isFinite(km) ? km : 0;
}

// ✅ Tarifa simple con tarifa mínima
export function fareByDistance(
  km,
  { base = 0.8, perKm = 0.39, decimals = 2, minFare = 1.25 } = {}
) {
  const k = typeof km === 'number' && km > 0 ? km : 0;

  const raw = base + k * perKm;

  const enforced = Math.max(typeof minFare === 'number' && Number.isFinite(minFare) ? minFare : 0, raw);

  const factor = 10 ** decimals;
  const rounded = Math.round((enforced + Number.EPSILON) * factor) / factor;

  return +rounded.toFixed(decimals);
}

// Decode de polylínea Google -> [{latitude, longitude}]
export function decodePolyline(encoded) {
  if (!encoded || typeof encoded !== 'string') return [];
  let index = 0,
    lat = 0,
    lng = 0;
  const points = [];

  while (index < encoded.length) {
    let b,
      shift = 0,
      result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}
