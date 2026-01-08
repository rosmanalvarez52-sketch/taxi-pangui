// src/components/MapView.web.js
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

// Leaflet (SOLO WEB)
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import {
  MapContainer,
  TileLayer,
  Marker as LMarker,
  Polyline as LPolyline,
  Popup,
  useMapEvents,
} from 'react-leaflet';

// Fix iconos Leaflet en bundlers (Expo Web)
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// En web NO usamos react-native-maps.
// Exportamos constantes para no romper imports { Marker, Polyline, PROVIDER_GOOGLE }
export const PROVIDER_GOOGLE = 'google';

// ----------------------------
// Helpers
// ----------------------------
function toNum(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function hasLatLng(p) {
  const lat = toNum(p?.lat);
  const lng = toNum(p?.lng);
  return lat !== null && lng !== null;
}

function coordToLatLng(c) {
  const lat = toNum(c?.latitude);
  const lng = toNum(c?.longitude);
  if (lat === null || lng === null) return null;
  return [lat, lng];
}

function ridePointToLatLng(p) {
  const lat = toNum(p?.lat);
  const lng = toNum(p?.lng);
  if (lat === null || lng === null) return null;
  return [lat, lng];
}

// ✅ Iconos circulares
function circleIcon(color) {
  return L.divIcon({
    className: '',
    html: `
      <div style="
        width:14px;height:14px;border-radius:50%;
        background:${color};
        border:2px solid white;
        box-shadow:0 1px 4px rgba(0,0,0,.35);
      "></div>
    `,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function pickIconByPinColor(pinColor, fallback = '#555') {
  if (!pinColor) return circleIcon(fallback);

  const c = String(pinColor).toLowerCase().trim();
  if (c === 'green') return circleIcon('#2ecc71');
  if (c === 'black') return circleIcon('#111');
  if (c === 'red') return circleIcon('#e74c3c');

  if (c.startsWith('#') || c.startsWith('rgb')) return circleIcon(c);

  return circleIcon(fallback);
}

// Para rides (RequestsMap): colores por tipo
const ICON_ORIGIN = circleIcon('#ff9800');
const ICON_DEST = circleIcon('#e74c3c');
const ICON_TAXI = circleIcon('#1877f2');
const ICON_PASSENGER = circleIcon('#2ecc71');

// ----------------------------
// Context para “emular” Marker/Polyline como en native
// ----------------------------
const WebMapCtx = createContext(null);
function useWebMapCtx() {
  return useContext(WebMapCtx);
}

// Marker stub compatible con <Marker coordinate=... />
export function Marker(props) {
  const ctx = useWebMapCtx();
  const idRef = useRef(`m_${Math.random().toString(16).slice(2)}`);

  useEffect(() => {
    if (!ctx) return;
    ctx.upsertMarker(idRef.current, props);
    return () => ctx.removeMarker(idRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ctx) return;
    ctx.upsertMarker(idRef.current, props);
  }, [ctx, props]);

  return null;
}

// Polyline stub compatible con <Polyline coordinates=[{latitude,longitude},...] />
export function Polyline(props) {
  const ctx = useWebMapCtx();
  const idRef = useRef(`l_${Math.random().toString(16).slice(2)}`);

  useEffect(() => {
    if (!ctx) return;
    ctx.upsertPolyline(idRef.current, props);
    return () => ctx.removePolyline(idRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ctx) return;
    ctx.upsertPolyline(idRef.current, props);
  }, [ctx, props]);

  return null;
}

/**
 * ✅ Web: click actúa como “long press”
 * Construimos un evento similar a RN:
 * - e.nativeEvent.coordinate
 * - e.coordinate (por si algún handler usa este)
 */
function ClickToPick({ enabled, onPick }) {
  useMapEvents({
    click(e) {
      if (!enabled) return;

      const { lat, lng } = e.latlng || {};
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const eventLikeRN = {
        coordinate: { latitude: lat, longitude: lng },
        nativeEvent: { coordinate: { latitude: lat, longitude: lng } },
      };

      onPick?.(eventLikeRN);
    },
  });

  return null;
}

export default function MapViewWeb({
  style,
  initialRegion,
  region,
  rides = [],
  children,
  onPickDestination, // compatibilidad con tu prop existente
  ...rest // ✅ para capturar onLongPress / onPress, etc.
}) {
  const [markers, setMarkers] = useState({});
  const [polylines, setPolylines] = useState({});

  const ctxValue = useMemo(
    () => ({
      upsertMarker: (id, props) => setMarkers((prev) => ({ ...prev, [id]: props })),
      removeMarker: (id) =>
        setMarkers((prev) => {
          const copy = { ...prev };
          delete copy[id];
          return copy;
        }),
      upsertPolyline: (id, props) => setPolylines((prev) => ({ ...prev, [id]: props })),
      removePolyline: (id) =>
        setPolylines((prev) => {
          const copy = { ...prev };
          delete copy[id];
          return copy;
        }),
    }),
    []
  );

  // ✅ Handler de “pick destino”:
  // 1) si PassengerHome pasa onLongPress (RN style) lo usamos
  // 2) si pasa onPress, también
  // 3) si pasa onPickDestination(coord), lo envolvemos para que reciba coords
  const pickHandler = useMemo(() => {
    if (typeof rest?.onLongPress === 'function') return rest.onLongPress;
    if (typeof rest?.onPress === 'function') return rest.onPress;

    if (typeof onPickDestination === 'function') {
      return (evt) => {
        const coord =
          evt?.nativeEvent?.coordinate || evt?.coordinate || evt;
        if (coord?.latitude == null || coord?.longitude == null) return;
        onPickDestination(coord);
      };
    }

    return null;
  }, [rest?.onLongPress, rest?.onPress, onPickDestination]);

  const pickEnabled = !!pickHandler;

  // Center del mapa
  const center = useMemo(() => {
    const r = region || initialRegion;
    const lat = toNum(r?.latitude);
    const lng = toNum(r?.longitude);

    if (lat !== null && lng !== null) return [lat, lng];

    const firstRide = Array.isArray(rides) ? rides.find((x) => hasLatLng(x?.origin)) : null;
    if (firstRide && hasLatLng(firstRide.origin)) return ridePointToLatLng(firstRide.origin);

    return [-1.5, -78.0];
  }, [region, initialRegion, rides]);

  const zoom = 14;

  // Layers desde rides (RequestsMap)
  const rideLayers = useMemo(() => {
    if (!Array.isArray(rides) || rides.length === 0) return [];

    return rides
      .filter((r) => hasLatLng(r?.origin))
      .map((r) => {
        const originLL = ridePointToLatLng(r.origin);
        const destLL = hasLatLng(r?.destination) ? ridePointToLatLng(r.destination) : null;

        const driverLL = hasLatLng(r?.driverLocation) ? ridePointToLatLng(r.driverLocation) : null;
        const passLL = hasLatLng(r?.passengerLocation) ? ridePointToLatLng(r.passengerLocation) : null;

        const routeCoords = Array.isArray(r?.route?.coords)
          ? r.route.coords
              .map((p) => {
                const lat = toNum(p?.latitude);
                const lng = toNum(p?.longitude);
                return lat !== null && lng !== null ? [lat, lng] : null;
              })
              .filter(Boolean)
          : [];

        return { id: r.id, originLL, destLL, driverLL, passLL, status: r.status, routeCoords };
      });
  }, [rides]);

  // Markers desde children (<Marker/> en PassengerHome)
  const childMarkers = useMemo(() => {
    return Object.entries(markers)
      .map(([id, m]) => {
        const ll = coordToLatLng(m?.coordinate);
        if (!ll) return null;

        const icon = pickIconByPinColor(m?.pinColor, '#1877f2');

        return {
          id,
          ll,
          title: m?.title,
          description: m?.description,
          icon,
        };
      })
      .filter(Boolean);
  }, [markers]);

  const childPolylines = useMemo(() => {
    return Object.entries(polylines)
      .map(([id, l]) => {
        const coords = Array.isArray(l?.coordinates)
          ? l.coordinates
              .map((p) => {
                const lat = toNum(p?.latitude);
                const lng = toNum(p?.longitude);
                return lat !== null && lng !== null ? [lat, lng] : null;
              })
              .filter(Boolean)
          : [];
        if (coords.length < 2) return null;
        return { id, coords, strokeColor: l?.strokeColor, strokeWidth: l?.strokeWidth };
      })
      .filter(Boolean);
  }, [polylines]);

  return (
    <View style={[{ flex: 1, backgroundColor: '#fff' }, style]}>
      <WebMapCtx.Provider value={ctxValue}>
        {children}

        <MapContainer center={center} zoom={zoom} style={{ width: '100%', height: '100%' }} scrollWheelZoom>
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* ✅ Click para elegir destino en web (equivale a onLongPress) */}
          <ClickToPick enabled={pickEnabled} onPick={pickHandler} />

          {/* Layers desde children (PassengerHome) */}
          {childMarkers.map((m) => (
            <LMarker key={m.id} position={m.ll} icon={m.icon}>
              {(m.title || m.description) && (
                <Popup>
                  <div style={{ fontWeight: 700 }}>{m.title || ''}</div>
                  <div style={{ marginTop: 4 }}>{m.description || ''}</div>
                </Popup>
              )}
            </LMarker>
          ))}

          {childPolylines.map((l) => (
            <LPolyline
              key={l.id}
              positions={l.coords}
              pathOptions={{ color: l.strokeColor || '#1877f2', weight: l.strokeWidth || 4 }}
            />
          ))}

          {/* Layers desde rides (RequestsMap) */}
          {rideLayers.map((r) => (
            <React.Fragment key={r.id}>
              {r.originLL && (
                <LMarker position={r.originLL} icon={ICON_ORIGIN}>
                  <Popup>
                    <div style={{ fontWeight: 800 }}>Ride: {r.id}</div>
                    <div>Estado: {r.status || '—'}</div>
                    <div style={{ marginTop: 6 }}>
                      Origen: {r.originLL[0].toFixed(5)}, {r.originLL[1].toFixed(5)}
                    </div>
                  </Popup>
                </LMarker>
              )}

              {r.destLL && <LMarker position={r.destLL} icon={ICON_DEST} />}

              {r.driverLL && (
                <LMarker position={r.driverLL} icon={ICON_TAXI}>
                  <Popup>
                    Taxi: {r.driverLL[0].toFixed(5)}, {r.driverLL[1].toFixed(5)}
                  </Popup>
                </LMarker>
              )}

              {r.passLL && (
                <LMarker position={r.passLL} icon={ICON_PASSENGER}>
                  <Popup>
                    Pasajero: {r.passLL[0].toFixed(5)}, {r.passLL[1].toFixed(5)}
                  </Popup>
                </LMarker>
              )}

              {Array.isArray(r.routeCoords) && r.routeCoords.length > 1 && (
                <LPolyline positions={r.routeCoords} pathOptions={{ color: '#1877f2', weight: 4 }} />
              )}
            </React.Fragment>
          ))}
        </MapContainer>
      </WebMapCtx.Provider>
    </View>
  );
}
