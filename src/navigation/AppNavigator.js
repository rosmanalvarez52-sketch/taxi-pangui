// src/navigation/AppNavigator.js
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

import AuthStack from './AuthStack';
import AdminStack from './AdminStack';
import PassengerStack from './PassengerStack';

export default function AppNavigator() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);

      if (!u) {
        setRole(null);
        setLoading(false);
        return;
      }

      try {
        const ref = doc(db, 'users', u.uid);
        const snap = await getDoc(ref);
        const r = snap.exists() ? (snap.data()?.role || 'passenger') : 'passenger';
        setRole(r);
      } catch (e) {
        console.log('Error leyendo rol:', e);
        setRole('passenger');
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const isAdmin = user && (role === 'driver_admin' || role === 'secretary');

  return (
    <NavigationContainer>
      {!user && <AuthStack />}
      {user && !isAdmin && <PassengerStack />}
      {user && isAdmin && <AdminStack />}
    </NavigationContainer>
  );
}
