// src/screens/Login.js
import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Button, Alert, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute, CommonActions } from '@react-navigation/native';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { ensureUserProfile } from '../lib/userProfile';

export default function Login() {
  const navigation = useNavigation();
  const route = useRoute();

  // ✅ modo: 'user' | 'admin'
  const mode = route.params?.mode === 'admin' ? 'admin' : 'user';

  // ✅ Título dinámico según modo
  const titleText = useMemo(
    () => (mode === 'admin' ? 'Ingresa como Administrador' : 'Ingresa como Usuario'),
    [mode]
  );

  // (Opcional) Texto de ayuda dinámico
  const helperText = useMemo(
    () =>
      mode === 'admin'
        ? 'Acceso para administradores/taxistas autorizados.'
        : 'Ingresa con tu cuenta para solicitar un taxi.',
    [mode]
  );

  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [loading, setLoading] = useState(false);

  // Helper: resetea la navegación y pone un stack como raíz
  const resetTo = (screenName) => {
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: screenName }],
      })
    );
  };

  async function routeByRole(uid) {
    const ref = doc(db, 'users', uid);
    const snap = await getDoc(ref);
    const role = snap.exists() ? (snap.data()?.role || 'passenger') : 'passenger';

    // 👇 Ajusta aquí tus roles reales
    const isAdmin = role === 'driver_admin' || role === 'secretary' || role === 'admin';
    resetTo(isAdmin ? 'AdminStack' : 'PassengerStack');
  }

  async function onLogin() {
    if (loading) return;

    const emailNorm = (email || '').trim().toLowerCase();
    const pwdNorm = (pwd || '').trim();

    if (!emailNorm || !pwdNorm) {
      return Alert.alert('Atención', 'Completa correo y contraseña.');
    }

    setLoading(true);
    try {
      const { user } = await signInWithEmailAndPassword(auth, emailNorm, pwdNorm);

      // Crea/actualiza el perfil (rol) si aún no existe o cambió
      await ensureUserProfile(user);

      // Enruta según rol leído en Firestore
      await routeByRole(user.uid);
    } catch (e) {
      console.log(e);
      let msg = 'No se pudo iniciar sesión';
      if (e?.code === 'auth/invalid-email') msg = 'Correo no válido.';
      else if (e?.code === 'auth/user-not-found') msg = 'Usuario no registrado.';
      else if (e?.code === 'auth/wrong-password') msg = 'Contraseña incorrecta.';
      else if (e?.message) msg = e.message;
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ flex: 1, padding: 16, justifyContent: 'center' }}>
      <Text style={{ fontSize: 26, fontWeight: '700', marginBottom: 6 }}>
        {titleText}
      </Text>

      <Text style={{ color: '#666', marginBottom: 16 }}>
        {helperText}
      </Text>

      <TextInput
        placeholder="Correo"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        style={{ borderWidth: 1, marginBottom: 12, padding: 12, borderRadius: 10 }}
      />

      <TextInput
        placeholder="Contraseña"
        secureTextEntry
        value={pwd}
        onChangeText={setPwd}
        style={{ borderWidth: 1, marginBottom: 16, padding: 12, borderRadius: 10 }}
      />

      {loading ? (
        <ActivityIndicator size="large" />
      ) : (
        <>
          <Button title="INGRESAR" onPress={onLogin} />
          <View style={{ height: 10 }} />

          {/* Solo mostramos "Crear cuenta" si entró como usuario */}
          {mode !== 'admin' && (
            <>
              <Button title="CREAR CUENTA" onPress={() => navigation.navigate('Register')} />
              <View style={{ marginTop: 12 }}>
                <Text style={{ color: '#666', fontSize: 12 }}>
                  Si tu correo está en la lista de administradores, tu cuenta tendrá rol de
                  administrador automáticamente.
                </Text>
              </View>
            </>
          )}
        </>
      )}
    </View>
  );
}
