// src/navigation/DriverStack.js
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import DriverHome from '../screens/DriverHome';
import RideLive from '../screens/RideLive';

const Stack = createNativeStackNavigator();

export default function DriverStack() {
  return (
    <Stack.Navigator
      initialRouteName="DriverHome"
      screenOptions={{
        headerStyle: { backgroundColor: '#2196f3' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
      }}
    >
      <Stack.Screen
        name="DriverHome"
        component={DriverHome}
        options={{ title: 'Solicitudes Cercanas' }}
      />

      <Stack.Screen
        name="RideLive"
        component={RideLive}
        options={{ title: 'En viaje' }}
      />
    </Stack.Navigator>
  );
}
