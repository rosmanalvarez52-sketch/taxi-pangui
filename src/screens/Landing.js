// src/screens/Landing.js
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';

export default function Landing() {
  const navigation = useNavigation();

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>Bienvenido a Taxi El Pangui</Text>

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => navigation.navigate('Login', { mode: 'passenger' })}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryBtnText}>INGRESAR COMO USUARIO</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => navigation.navigate('Login', { mode: 'admin' })}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryBtnText}>INGRESAR COMO ADMINISTRADOR</Text>
        </TouchableOpacity>

        <View style={{ height: 14 }} />

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => navigation.navigate('Register')}
          activeOpacity={0.85}
        >
          <Text style={styles.secondaryBtnText}>CREAR CUENTA COMO (USUARIO O ADMINISTRADOR)</Text>
        </TouchableOpacity>

        <Text style={styles.note}>
          Nota: Si tu cuenta tiene rol <Text style={{ fontWeight: '700' }}>driver_admin</Text> o{' '}
          <Text style={{ fontWeight: '700' }}>secretary</Text>, entrarás automáticamente al Panel Admin.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f2f4f7',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 22,
    paddingHorizontal: 18,
    ...Platform.select({
      web: { boxShadow: '0px 8px 24px rgba(0,0,0,0.08)' },
      default: { elevation: 3 },
    }),
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 16,
  },
  primaryBtn: {
    backgroundColor: '#1877f2',
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 10,
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.4,
  },
  secondaryBtn: {
    backgroundColor: '#1877f2',
    paddingVertical: 12,
    borderRadius: 10,
  },
  secondaryBtnText: {
    color: '#fff',
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.4,
  },
  note: {
    marginTop: 14,
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    lineHeight: 16,
  },
});
