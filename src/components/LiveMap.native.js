// src/components/LiveMap.native.js
import React from 'react';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { View } from 'react-native';

export default function LiveMap({ path = [], origin, destination }) {
  if (!origin) return <View style={{ flex: 1 }} />;

  const region = {
    latitude: origin.lat,
    longitude: origin.lng,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  };

  return (
    <MapView style={{ flex: 1 }} initialRegion={region}>
      <Marker coordinate={{ latitude: origin.lat, longitude: origin.lng }} title="Origen" />
      {destination && (
        <Marker coordinate={{ latitude: destination.lat, longitude: destination.lng }} pinColor="green" title="Destino" />
      )}
      {path.length > 0 && (
        <Polyline
          coordinates={path.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
          strokeColor="#1976d2"
          strokeWidth={4}
        />
      )}
    </MapView>
  );
}
