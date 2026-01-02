// Haversine y cálculo de tarifa simple:
const R = 6371; // km

function toRad(v){ return v * Math.PI/180; }
export function distanceKm(a, b){
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function fareByDistance(km, base = 1.00, perKm = 0.35){
  // ejemplo: $1 base + $0.35 por km (ajusta a tu realidad/local)
  return +(base + perKm * Math.max(0, km)).toFixed(2);
}
