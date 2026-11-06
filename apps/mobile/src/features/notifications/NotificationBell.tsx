import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '@localloop/shared';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui';
import { useUnreadCount } from './api';

export function NotificationBell() {
  const { t } = useTranslation();
  const unread = useUnreadCount().data ?? 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={unread ? t('notifications.unread', { count: unread }) : t('notifications.title')}
      onPress={() => router.push('/notifications')}
      style={styles.button}
      hitSlop={4}
    >
      <Ionicons name="notifications-outline" size={26} color={colors.text.primary} />
      {unread > 0 && (
        <View style={styles.badge}>
          <AppText variant="caption" weight="bold" color={colors.text.onBrand}>
            {unread > 9 ? '9+' : unread}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, backgroundColor: colors.surface.card },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.status.danger,
  },
});
