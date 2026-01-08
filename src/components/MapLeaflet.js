// src/components/MapLeaflet.js
import React, { useEffect, useMemo } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Tooltip,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix iconos en Leaflet (cuando se ve el marker roto en web)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ✅ Tiles CLAROS por defecto (mejor experiencia de usuario)
const DEFAULT_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const DEFAULT_ATTRIBUTION = '© OpenStreetMap';

function toLatLng(p) {
  const lat = Number(p?.latitude);
  const lng = Number(p?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return [lat, lng];
}

function FitBounds({ markers, polylines, fitToBounds }) {
  const map = useMap();

  useEffect(() => {
    if (!fitToBounds) return;

    // 1) Si hay polylines (ruta real), encuadrar la ruta (mejor UX)
    const routePoints = [];
    for (const pl of polylines || []) {
      for (const pt of pl.points || []) {
        const ll = toLatLng(pt);
        if (ll) routePoints.push(ll);
      }
    }

    if (routePoints.length > 1) {
      try {
        const bounds = L.latLngBounds(routePoints);
        map.fitBounds(bounds, { padding: [30, 30] });
      } catch (_) {}
      return;
    }

    // 2) Si no hay ruta, encuadrar markers
    const mkPoints = [];
    for (const m of markers || []) {
      const ll = toLatLng({ latitude: m.latitude, longitude: m.longitude });
      if (ll) mkPoints.push(ll);
    }

    if (mkPoints.length > 1) {
      try {
        const bounds = L.latLngBounds(mkPoints);
        map.fitBounds(bounds, { padding: [30, 30] });
      } catch (_) {}
    }
  }, [map, markers, polylines, fitToBounds]);

  return null;
}

function MapClickHandler({ onPickDestination }) {
  const map = useMap();

  useEffect(() => {
    if (typeof onPickDestination !== 'function') return;

    const handler = (e) => {
      const { lat, lng } = e.latlng || {};
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      onPickDestination({ latitude: lat, longitude: lng });
    };

    // En web, "long press" suele mapearse a click derecho
    map.on('contextmenu', handler);
    return () => map.off('contextmenu', handler);
  }, [map, onPickDestination]);

  return null;
}

export default function MapLeaflet({
  origin,
  markers = [],
  polylines = [],
  onPickDestination,
  fitToBounds = true,
  tileUrl,
  tileAttribution,
}) {
  const center = useMemo(() => {
    const ll = toLatLng(origin);
    return ll || [-1.0, -78.0];
  }, [origin]);

  const finalTileUrl = (tileUrl || '').trim() || DEFAULT_TILE_URL;
  const finalAttribution = (tileAttribution || '').trim() || DEFAULT_ATTRIBUTION;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        zIndex: 0,
        pointerEvents: 'auto',
      }}
    >
      <MapContainer
        center={center}
        zoom={14}
        style={{ width: '100%', height: '100%' }}
        preferCanvas={true}
      >
        <TileLayer url={finalTileUrl} attribution={finalAttribution} />

        <FitBounds markers={markers} polylines={polylines} fitToBounds={fitToBounds} />

        {typeof onPickDestination === 'function' ? (
          <MapClickHandler onPickDestination={onPickDestination} />
        ) : null}

        {/* MARKERS */}
        {(markers || []).map((m) => {
          const lat = Number(m.latitude);
          const lng = Number(m.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

          return (
            <Marker key={m.id} position={[lat, lng]}>
              {m.label ? (
                <Tooltip direction="top" offset={[0, -10]} opacity={0.95} permanent={false}>
                  <span style={{ whiteSpace: 'pre-line' }}>{m.label}</span>
                </Tooltip>
              ) : null}
            </Marker>
          );
        })}

        {/* POLYLINES (RUTA REAL) */}
        {(polylines || []).map((pl) => {
          const pts = (pl.points || []).map((p) => toLatLng(p)).filter(Boolean);
          if (pts.length < 2) return null;

          return (
            <Polyline
              key={pl.id}
              positions={pts}
              pathOptions={{
                color: pl.color || '#1877f2',
                weight: 5,
                opacity: 0.95,
              }}
            />
          );
        })}
      </MapContainer>
    </div>
  );
}
