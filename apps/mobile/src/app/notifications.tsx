import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing } from '@localloop/shared';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackRow } from '@/components/BackRow';
import { AppText, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { useProfile } from '@/features/account/api';
import { useMarkAllRead, useNotifications } from '@/features/notifications/api';
import { notificationTarget } from '@/lib/notificationTarget';

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  delivery_request: 'bicycle',
  assignment_cancelled: 'close-circle',
  low_stock: 'alert-circle',
  new_review: 'star',
  payout_sent: 'cash',
  support_reply: 'chatbubbles',
};

/** Inbox of everything the app has notified this user about — useful when pushes were missed or turned off. */
export default function NotificationsScreen() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'te' ? 'te-IN' : 'en-IN';
  const list = useNotifications();
  const profile = useProfile();
  const markRead = useMarkAllRead();

  // Opening the inbox counts as reading it.
  useEffect(() => {
    if (list.data?.some((n) => !n.read_at)) markRead.mutate();
  }, [list.data]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <BackRow title={t('notifications.title')} />
      </View>
      {list.isPending ? (
        <LoadingState />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : (
        <FlatList
          data={list.data}
          keyExtractor={(n) => n.id}
          contentContainerStyle={styles.list}
          refreshing={list.isRefetching}
          onRefresh={() => void list.refetch()}
          ListEmptyComponent={<EmptyState icon="notifications-off-outline" message={t('notifications.empty')} />}
          renderItem={({ item }) => {
            const data = (item.data ?? {}) as Record<string, unknown>;
            const to = notificationTarget(profile.data?.role, item.type, data);
            const text = i18n.exists(`notifications.${item.type}`) ? t(`notifications.${item.type}`, data as Record<string, string>) : t('notifications.generic');
            return (
              <Pressable
                accessibilityRole={to ? 'button' : 'text'}
                disabled={!to}
                onPress={() => to && router.push(to)}
                style={({ pressed }) => [styles.item, !item.read_at && styles.unread, pressed && styles.pressed]}
              >
                <Ionicons name={ICONS[item.type] ?? 'receipt'} size={24} color={colors.brand.forest} />
                <View style={styles.flex}>
                  <AppText weight={item.read_at ? 'regular' : 'bold'}>{text}</AppText>
                  <AppText variant="caption" color={colors.text.secondary}>
                    {new Date(item.created_at).toLocaleString(lang, { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}
                  </AppText>
                </View>
                {to && <Ionicons name="chevron-forward" size={20} color={colors.text.muted} />}
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.background },
  header: { paddingHorizontal: spacing.lg },
  list: { padding: spacing.lg, gap: spacing.sm, flexGrow: 1 },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, minHeight: 64, borderRadius: radii.md, backgroundColor: colors.surface.card },
  unread: { borderLeftWidth: 4, borderLeftColor: colors.brand.forest },
  pressed: { opacity: 0.7 },
  flex: { flex: 1 },
});
