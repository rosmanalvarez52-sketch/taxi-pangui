// src/components/MapView.web.js
import React, { forwardRef } from 'react';
import { View } from 'react-native';
import MapLeaflet from './MapLeaflet';

export const PROVIDER_GOOGLE = 'web';

export function Marker() {
  return null;
}
Marker.displayName = 'MarkerWeb';

export function Polyline() {
  return null;
}
Polyline.displayName = 'PolylineWeb';

function toNumber(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function hasLatLng(point) {
  const lat = toNumber(point?.lat);
  const lng = toNumber(point?.lng);
  return lat !== null && lng !== null;
}

function stableIdFromCoords(prefix, coordinates = []) {
  if (!Array.isArray(coordinates) || coordinates.length === 0) return `${prefix}-empty`;
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  const a = `${toNumber(first?.latitude) ?? ''},${toNumber(first?.longitude) ?? ''}`;
  const b = `${toNumber(last?.latitude) ?? ''},${toNumber(last?.longitude) ?? ''}`;
  return `${prefix}-${coordinates.length}-${a}-${b}`;
}

function buildFromRides(rides = []) {
  const markers = [];
  const polylines = [];

  rides.forEach((ride) => {
    const { origin: o, destination: d, status, route } = ride;

    if (hasLatLng(o)) {
      markers.push({
        id: `${ride.id}-origin`,
        latitude: toNumber(o.lat),
        longitude: toNumber(o.lng),
        label: `Origen (${status || 'open'})\nID: ${ride.id}`,
        kind: 'origin',
        status: status || 'open',
      });
    }

    if (hasLatLng(d)) {
      markers.push({
        id: `${ride.id}-dest`,
        latitude: toNumber(d.lat),
        longitude: toNumber(d.lng),
        label: 'Destino',
        kind: 'destination',
        status: status || 'open',
        color: '#000000',
      });
    }

    if (Array.isArray(route?.coords) && route.coords.length > 1) {
      polylines.push({
        id: `${ride.id}-route`,
        status: status || 'open',
        points: route.coords
          .map((p) => ({
            latitude: toNumber(p?.latitude),
            longitude: toNumber(p?.longitude),
          }))
          .filter((p) => p.latitude != null && p.longitude != null),
        color: status === 'assigned' ? '#4CAF50' : '#FF9800',
      });
    }
  });

  return { markers, polylines };
}

function buildFromChildren(children) {
  const markers = [];
  const polylines = [];

  React.Children.forEach(children, (child) => {
    if (!child) return;

    if (child.type === React.Fragment) {
      const nested = buildFromChildren(child.props?.children);
      markers.push(...nested.markers);
      polylines.push(...nested.polylines);
      return;
    }

    if (child.type === Marker) {
      const { coordinate, title, description, pinColor } = child.props || {};
      const lat = toNumber(coordinate?.latitude);
      const lng = toNumber(coordinate?.longitude);

      if (lat !== null && lng !== null) {
        const keyId = child.key != null ? String(child.key) : null;
        const id = keyId || (title ? `mk-${title}-${lat}-${lng}` : `mk-${lat}-${lng}`);

        markers.push({
          id,
          latitude: lat,
          longitude: lng,
          label: `${title || 'Punto'}${description ? `\n${description}` : ''}`,
          kind: title === 'Taxi' ? 'taxi' : 'point',
          status: 'open',
          color: pinColor || null,
        });
      }
      return;
    }

    if (child.type === Polyline) {
      const { coordinates, strokeColor } = child.props || {};
      if (Array.isArray(coordinates) && coordinates.length > 1) {
        const keyId = child.key != null ? String(child.key) : null;
        const id = keyId || stableIdFromCoords('poly', coordinates);

        polylines.push({
          id,
          status: 'open',
          points: coordinates
            .map((p) => ({
              latitude: toNumber(p?.latitude),
              longitude: toNumber(p?.longitude),
            }))
            .filter((p) => p.latitude != null && p.longitude != null),
          color: strokeColor || null,
        });
      }
    }
  });

  return { markers, polylines };
}

// ✅ forwardRef para que ref={mapRef} en RideLive no rompa en web
const MapViewWeb = forwardRef(function MapViewWeb(
  { style, initialRegion, rides = null, children },
  _ref
) {
  const origin = initialRegion
    ? { latitude: initialRegion.latitude, longitude: initialRegion.longitude }
    : { latitude: -3.676, longitude: -79.002 };

  const data = Array.isArray(rides)
    ? buildFromRides(rides)
    : buildFromChildren(children);

  return (
    <View style={style}>
      <MapLeaflet origin={origin} markers={data.markers} polylines={data.polylines} />
    </View>
  );
});

export default MapViewWeb;
