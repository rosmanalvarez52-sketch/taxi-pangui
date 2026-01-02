// src/screens/Register.js
import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Button, Alert, ActivityIndicator } from 'react-native';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import Constants from 'expo-constants';

export default function Register() {
  const navigation = useNavigation();

  const ADMIN_EMAILS = useMemo(() => {
    const list =
      Constants.expoConfig?.extra?.adminEmails ??
      Constants.manifest?.extra?.adminEmails ?? [];
    return (list || []).map((e) => (e || '').toLowerCase().trim());
  }, []);

  const [names, setNames] = useState('');
  const [surnames, setSurnames] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [loading, setLoading] = useState(false);

  const resetTo = (screenName) =>
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: screenName }],
      })
    );

  function validate() {
    if (!names.trim() || !surnames.trim()) return 'Completa nombres y apellidos.';

    // Acepta +593..., 09..., o solo dígitos (7–15)
    const phoneNorm = phone.replace(/\s+/g, '');
    if (!/^(?:\+?\d{7,15}|0\d{8,9})$/.test(phoneNorm))
      return 'Ingresa un teléfono válido (7–15 dígitos).';

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return 'Correo no válido.';

    if (pwd.length < 6) return 'La contraseña debe tener al menos 6 caracteres.';
    if (pwd !== pwd2) return 'Las contraseñas no coinciden.';
    return null;
  }

  async function routeByRole(uid) {
    const snap = await getDoc(doc(db, 'users', uid));
    const role = snap.exists() ? (snap.data()?.role || 'passenger') : 'passenger';
    resetTo(role === 'admin' ? 'AdminStack' : 'PassengerStack');
  }

  async function onRegister() {
    if (loading) return;
    const err = validate();
    if (err) return Alert.alert('Atención', err);

    setLoading(true);
    try {
      const emailNorm = email.trim().toLowerCase();
      const phoneNorm = phone.replace(/\s+/g, '');

      const { user } = await createUserWithEmailAndPassword(auth, emailNorm, pwd);

      const role = ADMIN_EMAILS.includes(emailNorm) ? 'admin' : 'passenger';

      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: emailNorm,
        names: names.trim(),
        surnames: surnames.trim(),
        phone: phoneNorm,
        role,
        createdAt: serverTimestamp(),
      });

      await routeByRole(user.uid);
    } catch (e) {
      console.log(e);
      let msg = 'No se pudo crear la cuenta';
      if (e.code === 'auth/email-already-in-use') msg = 'Ese correo ya está registrado.';
      else if (e.code === 'auth/invalid-email') msg = 'Correo no válido.';
      else if (e.code === 'auth/weak-password') msg = 'Contraseña demasiado débil.';
      else if (e.message) msg = e.message;
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 16 }}>Regístrate</Text>

      <TextInput
        placeholder="Nombres"
        value={names}
        onChangeText={setNames}
        style={{ borderWidth: 1, marginBottom: 12, padding: 12, borderRadius: 10 }}
      />
      <TextInput
        placeholder="Apellidos"
        value={surnames}
        onChangeText={setSurnames}
        style={{ borderWidth: 1, marginBottom: 12, padding: 12, borderRadius: 10 }}
      />
      <TextInput
        placeholder="Teléfono (ej. +5939...)"
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
        style={{ borderWidth: 1, marginBottom: 12, padding: 12, borderRadius: 10 }}
      />
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
        style={{ borderWidth: 1, marginBottom: 12, padding: 12, borderRadius: 10 }}
      />
      <TextInput
        placeholder="Repite la contraseña"
        secureTextEntry
        value={pwd2}
        onChangeText={setPwd2}
        style={{ borderWidth: 1, marginBottom: 16, padding: 12, borderRadius: 10 }}
      />

      {loading ? <ActivityIndicator size="large" /> : <Button title="Crear cuenta" onPress={onRegister} />}

      <Text style={{ marginTop: 12, color: '#666', fontSize: 12 }}>
        Si tu correo está en la lista de administradores, el rol se asignará automáticamente.
      </Text>
    </View>
  );
}
