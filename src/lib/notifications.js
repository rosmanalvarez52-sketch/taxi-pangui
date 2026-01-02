// src/lib/notifications.js
import * as Notifications from 'expo-notifications';
import { Platform, Alert } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Guardamos el último id para poder “actualizar” la notificación
let lastAssignedNotificationId = null;

export async function setupLocalNotifications() {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Notificaciones',
        importance: Notifications.AndroidImportance.HIGH,
        sound: true,
      });
    }

    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permisos requeridos',
        'Activa las notificaciones para recibir alertas cuando un taxi sea asignado.'
      );
      return false;
    }

    console.log('✅ Notificaciones locales habilitadas');
    return true;
  } catch (e) {
    console.warn('⚠️ No se pudieron configurar las notificaciones:', e?.message);
    return false;
  }
}

/**
 * Construye el texto de la notificación con TODA la info:
 * - conductor
 * - placa
 * - ETA destino
 * - ETA recogida (pickup)
 */
function buildAssignedBody({ driverName, driverPlate, etaToDestMin, etaToPickupMin }) {
  const name = driverName?.trim() ? driverName.trim() : 'Conductor';
  const plate = driverPlate?.trim() ? driverPlate.trim() : '---';

  const parts = [];
  parts.push(`Conductor: ${name}`);
  parts.push(`Placa: ${plate}`);

  if (typeof etaToDestMin === 'number') {
    parts.push(`Destino: ~${etaToDestMin} min`);
  }
  if (typeof etaToPickupMin === 'number') {
    parts.push(`Llega a recogerte: ~${etaToPickupMin} min`);
  }

  return parts.join('  •  ');
}

/**
 * Notificación principal: Taxi asignado
 * Si ya existe una anterior, la “actualiza” (la descarta y crea otra).
 */
export async function notifyAssignedFull({
  driverName,
  driverPlate,
  etaToDestMin = null,
  etaToPickupMin = null,
} = {}) {
  try {
    // Si ya había una notificación anterior, la quitamos para “actualizar”
    if (lastAssignedNotificationId) {
      try {
        await Notifications.dismissNotificationAsync(lastAssignedNotificationId);
      } catch (_) {}
      lastAssignedNotificationId = null;
    }

    const body = buildAssignedBody({
      driverName,
      driverPlate,
      etaToDestMin,
      etaToPickupMin,
    });

    lastAssignedNotificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Taxi asignado 🚕',
        body,
        sound: true,
      },
      trigger: null,
    });

    console.log('🔔 Notificación asignado OK:', body);
  } catch (e) {
    console.warn('⚠️ Error al mostrar notificación:', e?.message);
  }
}

/**
 * Útil por si quieres limpiar cuando termina/cancela.
 */
export async function clearAssignedNotification() {
  if (!lastAssignedNotificationId) return;
  try {
    await Notifications.dismissNotificationAsync(lastAssignedNotificationId);
  } catch (_) {}
  lastAssignedNotificationId = null;
}
