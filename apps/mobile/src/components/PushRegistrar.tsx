import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { useProfile } from '@/features/account/api';
import { registerForPush } from '@/services/push';

/**
 * Registers the device for push once the user has a role, and routes taps on
 * notifications. Renders nothing.
 */
export function PushRegistrar() {
  const { data: profile } = useProfile();

  useEffect(() => {
    if (!profile?.role) return;
    void registerForPush(profile.id).then((r) => {
      if (r.status !== 'registered' && __DEV__) console.info('[push]', r.status, 'detail' in r ? r.detail : '');
    });
  }, [profile?.id, profile?.role]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { order_id?: string; type?: string };
      if (data.order_id && profile?.role === 'customer') router.push({ pathname: '/order/[id]', params: { id: data.order_id } });
    });
    return () => sub.remove();
  }, [profile?.role]);

  return null;
}
