// src/navigation/AdminStack.js
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AdminHome from '../screens/AdminHome';
import RequestsMap from '../screens/admin/RequestsMap';
import AssignRide from '../screens/admin/AssignRide';
import ChatRide from '../screens/ChatRide';

const Stack = createNativeStackNavigator();

export default function AdminStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerBackTitleVisible: false,
      }}
    >
      <Stack.Screen name="AdminHome" component={AdminHome} options={{ title: 'Panel Admin' }} />
      <Stack.Screen name="RequestsMap" component={RequestsMap} options={{ title: 'Solicitudes en mapa' }} />
      <Stack.Screen name="AssignRide" component={AssignRide} options={{ title: 'Asignar carrera' }} />

      {/* ✅ NUEVO */}
      <Stack.Screen name="ChatRide" component={ChatRide} options={{ title: 'Chat' }} />
    </Stack.Navigator>
  );
}
