import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

// Show notifications while the app is open (orders move fast; users expect the banner).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Android channels must match `channelId` set by the send-push edge function. */
async function ensureChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('orders', {
    name: 'Orders',
    importance: Notifications.AndroidImportance.HIGH,
    lightColor: '#174C38',
  });
  await Notifications.setNotificationChannelAsync('deliveries', {
    name: 'Delivery requests',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 400, 200, 400],
    lightColor: '#E9A83A',
  });
  await Notifications.setNotificationChannelAsync('account', {
    name: 'Account & shop updates',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

export type PushRegistration =
  | { status: 'registered'; token: string }
  | { status: 'denied' | 'simulator' | 'not_configured' | 'error'; detail?: string };

/**
 * Asks for notification permission, obtains the Expo push token and stores it
 * against the signed-in user. Requires an EAS project id (EAS_PROJECT_ID) and,
 * for Android, FCM credentials uploaded to EAS — see docs/setup.md.
 */
export async function registerForPush(userId: string): Promise<PushRegistration> {
  await ensureChannels();
  if (!Device.isDevice) return { status: 'simulator' };

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId) return { status: 'not_configured', detail: 'EAS_PROJECT_ID missing' };

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return { status: 'denied' };

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const { error } = await supabase.from('push_tokens').upsert({
      token,
      user_id: userId,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      updated_at: new Date().toISOString(),
    });
    if (error) return { status: 'error', detail: error.message };
    return { status: 'registered', token };
  } catch (e) {
    return { status: 'error', detail: String(e) };
  }
}

/** Remove this device's token on sign-out so the next user doesn't receive the previous user's pushes. */
export async function unregisterPush() {
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    if (!projectId || !Device.isDevice) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await supabase.from('push_tokens').delete().eq('token', token);
  } catch {
    /* best effort */
  }
}
