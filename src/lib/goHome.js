// src/lib/goHome.js
import { CommonActions } from '@react-navigation/native';
import { signOut } from 'firebase/auth';
import { auth } from './firebase';

/**
 * Devuelve true si el navigator actual conoce una ruta con ese nombre.
 * Esto evita warnings tipo: "RESET was not handled by any navigator"
 */
function hasRouteName(navigation, routeName) {
  try {
    const state = navigation?.getState?.();
    const names = state?.routeNames || [];
    return names.includes(routeName);
  } catch (_) {
    return false;
  }
}

/**
 * Vuelve al inicio real (Landing) cerrando sesión.
 * ✅ Compatible: Web / Android / iOS
 *
 * Importante:
 * - Tras signOut, AppNavigator debe renderizar AuthStack automáticamente.
 * - SOLO hacemos reset si el navigator actual tiene Landing/Login.
 */
export async function goToAppStart(navigation) {
  try {
    await signOut(auth);
  } catch (_) {
    // ignorar errores de signOut
  }

  // Luego del signOut, AppNavigator debería cambiar a AuthStack.
  // Para evitar warnings, solo reseteamos si Landing/Login existe en este navigator.
  try {
    if (hasRouteName(navigation, 'Landing')) {
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'Landing' }],
        })
      );
      return;
    }

    if (hasRouteName(navigation, 'Login')) {
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'Login' }],
        })
      );
      return;
    }

    // Si estamos dentro de AdminStack/PassengerStack, NO forzamos reset a Landing
    // porque esas rutas no existen ahí. El signOut ya hará el cambio.
  } catch (_) {}
}

/**
 * Vuelve al inicio del panel Admin (AdminHome) sin cerrar sesión.
 * Útil para RequestsMap, AssignRide, etc.
 */
export function goAdminHome(navigation) {
  try {
    if (hasRouteName(navigation, 'AdminHome')) {
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'AdminHome' }],
        })
      );
      return;
    }
  } catch (_) {}

  // fallback
  try {
    navigation.navigate?.('AdminHome');
  } catch (_) {
    navigation.goBack?.();
  }
}

/**
 * Vuelve al inicio del pasajero (PassengerHome) sin cerrar sesión.
 */
export function goPassengerHome(navigation) {
  try {
    if (hasRouteName(navigation, 'PassengerHome')) {
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'PassengerHome' }],
        })
      );
      return;
    }
  } catch (_) {}

  // fallback
  try {
    navigation.navigate?.('PassengerHome');
  } catch (_) {
    navigation.goBack?.();
  }
}
