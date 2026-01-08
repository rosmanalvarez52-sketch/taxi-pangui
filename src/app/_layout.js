// src/app/_layout.js
import React, { useEffect, useState } from 'react';
import { Stack, Slot, useRouter } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import BrandHeader from '../components/BrandHeader';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

function normalizeRole(role) {
  return (role || '').toLowerCase().trim();
}

export default function RootLayout() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      try {
        if (!u) {
          router.replace('/login');
          return;
        }

        const snap = await getDoc(doc(db, 'users', u.uid));
        const role = snap.exists() ? normalizeRole(snap.data()?.role) : 'passenger';

        // ✅ Roles reales en tu BD: driver_admin, admin, secretary, passenger
        const isDriverOrAdmin = role === 'driver_admin' || role === 'admin';
        const isSecretary = role === 'secretary';

        if (isDriverOrAdmin || isSecretary) {
          router.replace('/(admin)/requests');
        } else {
          router.replace('/(app)/passenger');
        }
      } catch (e) {
        // fallback seguro
        router.replace('/(app)/passenger');
      } finally {
        setChecking(false);
      }
    });

    return () => unsub();
  }, [router]);

  return (
    <>
      <Stack
        screenOptions={{
          headerTitle: () => <BrandHeader />,
          headerTitleAlign: 'center',
        }}
      />

      {/* ✅ Slot SIEMPRE renderiza para que web no quede en blanco */}
      <Slot />

      {/* overlay mientras verifica */}
      {checking && (
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'white',
            opacity: 0.9,
          }}
        >
          <ActivityIndicator size="large" />
        </View>
      )}
    </>
  );
}
