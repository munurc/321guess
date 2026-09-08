import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { loadIdentity } from '@/lib/online-storage';
import { registerPushToken } from '@/lib/online-api';

/** No-op on web — there's no native push channel there, and this whole
 * feature only exists for the daily-challenge reminder on phones. */
export function PushRegistration() {
  useEffect(() => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
    if (!Device.isDevice) return; // simulators/emulators can't receive real push

    (async () => {
      try {
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.DEFAULT,
          });
        }

        let permission = await Notifications.getPermissionsAsync();
        if (permission.status !== 'granted') {
          permission = await Notifications.requestPermissionsAsync();
        }
        if (permission.status !== 'granted') return;

        const projectId = Constants.expoConfig?.extra?.eas?.projectId;
        if (!projectId) return; // not yet linked to an EAS project (`eas init`)

        const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({ projectId });
        const identity = await loadIdentity();
        await registerPushToken(expoPushToken, Platform.OS, identity?.token);
      } catch {
        // Best-effort — a failed push registration shouldn't disrupt the game.
      }
    })();
  }, []);

  return null;
}
