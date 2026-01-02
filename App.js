import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import BrandHeader from './src/components/BrandHeader';

// tus pantallas:
import Welcome from './src/screens/Welcome';
import Login from './src/screens/Login';
import PassengerHome from './src/screens/PassengerHome';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerTitle: () => <BrandHeader />,   // ← aquí va el logo+texto
          headerTitleAlign: 'center',
        }}
      >
        <Stack.Screen name="Welcome" component={Welcome} />
        <Stack.Screen name="Login" component={Login} />
        <Stack.Screen name="PassengerHome" component={PassengerHome} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
