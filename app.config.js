// app.config.js
import 'dotenv/config';

export default ({ config }) => ({
  expo: {
    ...config,

    name: 'Taxi El Pangui',
    slug: 'taxi-pangui',
    version: '1.0.1',
    orientation: 'portrait',

    icon: './assets/icon.png',

    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#FFFFFF',
    },

    plugins: ['expo-location', 'expo-web-browser'],

    android: {
      package: 'com.taxi.pangui',
      versionCode: 2,
      permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION'],
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY,
        },
      },
    },

    ios: {
      bundleIdentifier: 'com.taxi.pangui',
      supportsTablet: false,
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          'Esta aplicación necesita acceder a tu ubicación para mostrar tu posición en el mapa y calcular la tarifa del viaje.',
        NSLocationAlwaysAndWhenInUseUsageDescription:
          'Se requiere acceso a tu ubicación para mejorar la experiencia de seguimiento del viaje.',
      },
      config: {
        googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY,
      },
    },

    web: {
      favicon: './assets/favicon.png',
    },

    extra: {
      eas: {
        projectId: 'f5ff9864-c82c-4dc0-a3ac-5947d33f8596',
      },

      // ✅ IMPORTANTE para Vercel/Expo Web: usar EXPO_PUBLIC_*
      firebase: {
        apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MSG_SENDER_ID,
        appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID
      },

      googleMaps: {
        android: process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY,
        ios: process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY,
        web: process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY,
        rest: process.env.EXPO_PUBLIC_GOOGLE_MAPS_REST_KEY,
      },

      adminEmails: [
        'rosmanalvarez52@gmail.com',
        'morenojeffer205@gmail.com',
        'novillojhon12@gmail.com',
        'armijosmanu99@gmail.com',
        'naulawilli45@gmail.com',
        'farezfarez5@gmail.com',
        'carchinaun87@gmail.com',
        'aguilarjor33@gmail.com',
        'chuchuromulo25@gmail.com',
        'gonzaarnaldo31@gmail.com',
        'secretaxipangui11@gmail.com',
      ],
    },
  },
});
