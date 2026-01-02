// src/components/MapView.native.js
import React, { forwardRef } from 'react';
import RNMapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

// ✅ Exportar también Marker y Polyline para que los imports nombrados funcionen
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
  switch (status) {
    case 'open':
    case 'searching':
      return '#FF9800';
    case 'assigned':
      return '#4CAF50';
    default:
      return '#607D8B';
  }
}

// ✅ IMPORTANTE: forwardRef para que el padre (RideLive) pueda animar la cámara
const MapViewNative = forwardRef(function MapViewNative(
  { style, initialRegion, region, rides = [], children, ...rest },
  ref
) {
  return (
    <RNMapView
      ref={ref}
      style={style}
      provider={PROVIDER_GOOGLE}
      initialRegion={initialRegion}
      // ✅ si en algún momento decides usar region controlado
      region={region}
      {...rest}
    >
      {/* ✅ Si el padre renderiza markers propios (RideLive), se respetan */}
      {children}

      {/* ✅ Renders por "rides" (AssignRide / listas) */}
      {Array.isArray(rides) &&
        rides.map((ride) => {
          const { origin, destination, status, route } = ride;
          const color = getMarkerColor(status || 'open');

          // ✅ Taxi (driverLocation) - lo que faltaba para ver movimiento en AssignRide
          const driverLoc = ride?.driverLocation || ride?.driver?.location || null;

          // ✅ Opcional: pasajero (si algún día envías passengerLocation)
          const passengerLoc = ride?.passengerLocation || null;

          return (
            <React.Fragment key={ride.id}>
              {/* Origen */}
              {hasLatLng(origin) && (
                <Marker
                  coordinate={{
                    latitude: toNum(origin.lat),
                    longitude: toNum(origin.lng),
                  }}
                  title={`Origen (${status || 'open'})`}
                  description={`ID: ${ride.id}`}
                  pinColor={color}
                />
              )}

              {/* Destino */}
              {hasLatLng(destination) && (
                <Marker
                  coordinate={{
                    latitude: toNum(destination.lat),
                    longitude: toNum(destination.lng),
                  }}
                  title="Destino"
                  pinColor="black"
                />
              )}

              {/* ✅ Taxi */}
              {hasLatLng(driverLoc) && (
                <Marker
                  coordinate={{
                    latitude: toNum(driverLoc.lat),
                    longitude: toNum(driverLoc.lng),
                  }}
                  title="Taxi"
                  description="Conductor en movimiento"
                  pinColor="#1877f2"
                />
              )}

              {/* (Opcional) Pasajero */}
              {hasLatLng(passengerLoc) && (
                <Marker
                  coordinate={{
                    latitude: toNum(passengerLoc.lat),
                    longitude: toNum(passengerLoc.lng),
                  }}
                  title="Pasajero"
                  description="Ubicación actual"
                  pinColor="green"
                />
              )}

              {/* Ruta */}
              {Array.isArray(route?.coords) && route.coords.length > 0 && (
                <Polyline
                  coordinates={route.coords.map((p) => ({
                    latitude: p.latitude,
                    longitude: p.longitude,
                  }))}
                  strokeWidth={4}
                  strokeColor={status === 'assigned' ? '#4CAF50' : '#FF9800'}
                />
              )}
            </React.Fragment>
          );
        })}
    </RNMapView>
  );
});

export default MapViewNative;
