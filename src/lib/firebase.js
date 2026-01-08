// src/lib/firebase.js
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, initializeAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const extra = Constants?.expoConfig?.extra ?? Constants?.manifest?.extra ?? {};

function pick(...vals) {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return undefined;
}

const envConfig = {
  apiKey: pick(process.env.EXPO_PUBLIC_FIREBASE_API_KEY, process.env.FIREBASE_API_KEY),
  authDomain: pick(process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN, process.env.FIREBASE_AUTH_DOMAIN),
  projectId: pick(process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID, process.env.FIREBASE_PROJECT_ID),
  storageBucket: pick(
    process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    process.env.FIREBASE_STORAGE_BUCKET
  ),
  messagingSenderId: pick(
    process.env.EXPO_PUBLIC_FIREBASE_MSG_SENDER_ID,
    process.env.FIREBASE_MSG_SENDER_ID
  ),
  appId: pick(process.env.EXPO_PUBLIC_FIREBASE_APP_ID, process.env.FIREBASE_APP_ID),
};

const firebaseConfig = extra?.firebase?.apiKey ? extra.firebase : envConfig;

if (!firebaseConfig?.apiKey || !firebaseConfig?.projectId || !firebaseConfig?.appId) {
  console.warn(
    '[Firebase] Config incompleta. Revisa FIREBASE_* o EXPO_PUBLIC_FIREBASE_* / app.config.js extra.firebase'
  );
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

let auth;
if (Platform.OS === 'web') {
  auth = getAuth(app);
} else {
  try {
    auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch {
    auth = getAuth(app);
  }
}

const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };
