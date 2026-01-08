// src/components/MapView.native.js
import React, { forwardRef } from 'react';
import RNMapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

export { Marker, Polyline, PROVIDER_GOOGLE };

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

function getMarkerColor(status) {
  switch ((status || '').toLowerCase()) {
    case 'open':
    case 'searching':
      return '#FF9800';
    case 'assigned':
    case 'in_progress':
      return '#4CAF50';
    default:
      return '#607D8B';
  }
}

const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#38414e' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#17263c' }] },
];

const MapViewNative = forwardRef(function MapViewNative(
  { style, initialRegion, region, rides = [], children, mapStyleVariant = 'light', ...rest },
  ref
) {
  const customMapStyle = mapStyleVariant === 'dark' ? DARK_MAP_STYLE : null;

  return (
    <RNMapView
      ref={ref}
      style={style}
      provider={PROVIDER_GOOGLE}
      initialRegion={initialRegion}
      region={region}
      customMapStyle={customMapStyle}
      {...rest}
    >
      {children}

      {Array.isArray(rides) &&
        rides.map((ride) => {
          const { origin, destination, status, route } = ride;
          const color = getMarkerColor(status || 'open');

          const driverLoc = ride?.driverLocation || ride?.driver?.location || null;
          const passengerLoc = ride?.passengerLocation || null;

          return (
            <React.Fragment key={ride.id}>
              {hasLatLng(origin) && (
                <Marker
                  coordinate={{ latitude: toNum(origin.lat), longitude: toNum(origin.lng) }}
                  title={`Origen (${status || 'open'})`}
                  description={`ID: ${ride.id}`}
                  pinColor={color}
                />
              )}

              {hasLatLng(destination) && (
                <Marker
                  coordinate={{ latitude: toNum(destination.lat), longitude: toNum(destination.lng) }}
                  title="Destino"
                  pinColor="black"
                />
              )}

              {hasLatLng(driverLoc) && (
                <Marker
                  coordinate={{ latitude: toNum(driverLoc.lat), longitude: toNum(driverLoc.lng) }}
                  title="Taxi"
                  description="Conductor en movimiento"
                  pinColor="#1877f2"
                />
              )}

              {hasLatLng(passengerLoc) && (
                <Marker
                  coordinate={{ latitude: toNum(passengerLoc.lat), longitude: toNum(passengerLoc.lng) }}
                  title="Pasajero"
                  description="Ubicación actual"
                  pinColor="green"
                />
              )}

              {Array.isArray(route?.coords) && route.coords.length > 1 && (
                <Polyline
                  coordinates={route.coords.map((p) => ({
                    latitude: p.latitude,
                    longitude: p.longitude,
                  }))}
                  strokeWidth={4}
                  strokeColor={(status || '').toLowerCase() === 'assigned' ? '#4CAF50' : '#FF9800'}
                />
              )}
            </React.Fragment>
          );
        })}
    </RNMapView>
  );
});

export default MapViewNative;
