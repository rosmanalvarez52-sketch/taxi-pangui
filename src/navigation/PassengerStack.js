// src/navigation/PassengerStack.js
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import PassengerHome from '../screens/PassengerHome';
import RideLive from '../screens/RideLive';

// ✅ NUEVO: Chat
import ChatRide from '../screens/ChatRide';

const Stack = createNativeStackNavigator();

export default function PassengerStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerTitleAlign: 'center',
        headerBackTitleVisible: false,
      }}
    >
      <Stack.Screen
        name="PassengerHome"
        component={PassengerHome}
        options={{ title: 'Taxi El Pangui' }}
      />

      <Stack.Screen
        name="RideLive"
        component={RideLive}
        options={{ title: 'Viaje' }}
      />

      {/* ✅ NUEVO */}
      <Stack.Screen
        name="ChatRide"
        component={ChatRide}
        options={{ title: 'Chat' }}
      />
    </Stack.Navigator>
  );
}
