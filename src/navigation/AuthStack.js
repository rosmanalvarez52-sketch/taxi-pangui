// src/navigation/AuthStack.js
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Landing from '../screens/Landing';
import Login from '../screens/Login';
import Register from '../screens/Register';

const Stack = createNativeStackNavigator();

export default function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerBackTitleVisible: false }}>
      <Stack.Screen
        name="Landing"
        component={Landing}
        options={{ title: 'Inicio' }}
      />

      <Stack.Screen
        name="Login"
        component={Login}
        options={({ route }) => {
          const mode = route?.params?.mode === 'admin' ? 'admin' : 'user';
          return {
            title: mode === 'admin' ? 'Ingresar (Administrador)' : 'Ingresar (Usuario)',
          };
        }}
      />

      <Stack.Screen
        name="Register"
        component={Register}
        options={{ title: 'Crear cuenta' }}
      />
    </Stack.Navigator>
  );
}
