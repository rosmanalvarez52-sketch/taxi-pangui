// src/app/(app)/_layout.js
import React from 'react';
import { Stack } from 'expo-router';
import BrandHeader from '../../components/BrandHeader';

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerTitle: () => <BrandHeader />,
        headerTitleAlign: 'center',
      }}
    >
      <Stack.Screen name="passenger" options={{ title: 'Solicitar Taxi' }} />
    </Stack>
  );
}
