// src/navigation/RoleGate.js
import React from 'react';
import { View, Text, Button } from 'react-native';

export default function RoleGate({ navigation }) {
  return (
    <View style={{flex:1, alignItems:'center', justifyContent:'center', gap:16}}>
      <Text style={{fontSize:28, fontWeight:'700'}}>Taxi El Pangui</Text>
      <Text style={{opacity:0.7, marginBottom:12}}>Elige cómo deseas ingresar</Text>

      <Button title="Ingresar como USUARIO" onPress={() => navigation.navigate('Auth', { mode: 'user' })} />
      <Button title="Ingresar como ADMINISTRADOR" onPress={() => navigation.navigate('Auth', { mode: 'admin' })} />
    </View>
  );
}
