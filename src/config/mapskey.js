import { Platform } from 'react-native';

export function getMapsKey() {
  if (Platform.OS === 'web') {
    return process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY;
  }
  if (Platform.OS === 'ios') {
    return process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY;
  }
  return process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY;
}

// Para Directions / Distance Matrix (REST)
export const GOOGLE_MAPS_REST_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_REST_KEY;
