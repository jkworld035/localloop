import { colors, radii, spacing } from '@localloop/shared';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui';
import { useMyOrders } from './api';

/** Shops the customer has had delivered from recently — one tap back to the shop. */
export function OrderAgain() {
  const { t, i18n } = useTranslation();
  const te = i18n.language === 'te';
  const orders = useMyOrders();
  const shops = useMemo(() => {
    const seen = new Map<string, { id: string; name: string }>();
    for (const o of orders.data ?? []) {
      if (o.status === 'delivered' && o.store && !seen.has(o.store_id)) {
        seen.set(o.store_id, { id: o.store_id, name: te && o.store.name_te ? o.store.name_te : o.store.name });
      }
    }
    return [...seen.values()].slice(0, 8);
  }, [orders.data, te]);

  if (!shops.length) return null;
  return (
    <View style={styles.root}>
      <AppText variant="title" weight="bold" accessibilityRole="header">
        {t('home.order_again')}
      </AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {shops.map((s) => (
          <Pressable
            key={s.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/store/[id]', params: { id: s.id } })}
            style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
          >
            <AppText weight="medium" numberOfLines={2}>
              {s.name}
            </AppText>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  row: { gap: spacing.sm, paddingRight: spacing.lg },
  chip: {
    width: 140,
    minHeight: 64,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surface.border,
    backgroundColor: colors.surface.card,
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
});
