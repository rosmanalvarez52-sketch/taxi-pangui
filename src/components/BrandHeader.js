import React from 'react';
import { View, Image, Text } from 'react-native';

export default function BrandHeader() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Image
        source={require('../../assets/icon.png')} // o '../../assets/images/logo-header.png'
        style={{ width: 28, height: 28, borderRadius: 6 }}
        resizeMode="contain"
      />
      <Text style={{ fontSize: 18, fontWeight: '700' }}>Taxi El Pangui</Text>
    </View>
  );
}
