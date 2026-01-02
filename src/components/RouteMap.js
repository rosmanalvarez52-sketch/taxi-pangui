// src/components/RouteMap.js
import React, { useEffect, useState, useRef } from 'react';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { View, ActivityIndicator } from 'react-native';

export default function RouteMap({
  origin,        // { latitude, longitude }
  destination,   // { latitude, longitude } (opcional)
  polyline,      // array de { latitude, longitude } (opcional)
  onReadyFit,    // bool: ajustar cámara automáticamente
}) {
  const mapRef = useRef(null);

  useEffect(() => {
    if (!onReadyFit || !mapRef.current) return;
    const points = [
      ...(origin ? [origin] : []),
      ...(destination ? [destination] : []),
      ...(polyline || [])
    ];
    if (points.length > 0) {
      mapRef.current.fitToCoordinates(points, {
        edgePadding: { top: 80, right: 40, bottom: 80, left: 40 },
        animated: true,
      });
    }
  }, [origin, destination, polyline, onReadyFit]);

  if (!origin) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <MapView
      ref={mapRef}
      style={{ flex: 1 }}
      initialRegion={{
        latitude: origin.latitude,
        longitude: origin.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }}
    >
      <Marker coordinate={origin} title="Origen" pinColor="green" />
      {destination && <Marker coordinate={destination} title="Destino" pinColor="red" />}
      {polyline && polyline.length > 0 && (
        <Polyline coordinates={polyline} strokeWidth={5} />
      )}
    </MapView>
  );
}
