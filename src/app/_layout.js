// src/app/_layout.js
import React, { useEffect, useState } from 'react';
import { Stack, Slot, useRouter } from 'expo-router';
import BrandHeader from '../components/BrandHeader'; // ← ruta correcta
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export default function RootLayout() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      try {
        if (!u) {
          // No logueado → lleva a login
          router.replace('/login'); // ajusta si tu login está en otra ruta
          return;
        }
        // Logueado → lee rol
        const snap = await getDoc(doc(db, 'users', u.uid));
        const role = snap.exists() ? (snap.data().role || 'passenger') : 'passenger';

        if (role === 'admin' || role === 'driver') {
          // Admin/conductor → al mapa de solicitudes
          router.replace('/(admin)/requests');
        } else {
          // Pasajero → a su home
          router.replace('/(app)/passenger');
        }
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
      {/* Mientras redirige, Slot permite que router pinte la pantalla destino */}
      {!checking && <Slot />}
    </>
  );
}
