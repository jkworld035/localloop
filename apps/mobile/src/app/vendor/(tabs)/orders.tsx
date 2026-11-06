import { colors, formatINR, radii, spacing } from '@localloop/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Banner, Card, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { OrderStatusBadge } from '@/features/orders/OrderStatusBadge';
import { useMyStore, useVendorOrders, type OrderBucket } from '@/features/vendor/api';
import { useNow } from '@/lib/useNow';

const BUCKETS: OrderBucket[] = ['new', 'active', 'done'];

export default function VendorOrders() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'te' ? 'te' : 'en';
  const store = useMyStore();
  const [bucket, setBucket] = useState<OrderBucket>('new');
  const orders = useVendorOrders(store.data?.status === 'approved' ? store.data.id : undefined, bucket);
  const now = useNow();

  if (store.isPending) return <LoadingState />;
  if (!store.data || store.data.status !== 'approved') {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.pad}>
          <AppText variant="heading" weight="bold">
            {t('vendor.tabs.orders')}
          </AppText>
          <Banner tone="info" message={t('vendor.orders_after_approval')} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.pad}>
        <AppText variant="heading" weight="bold" accessibilityRole="header">
          {t('vendor.tabs.orders')}
        </AppText>
        <View style={styles.segment} accessibilityRole="tablist">
          {BUCKETS.map((b) => (
            <Pressable
              key={b}
              accessibilityRole="tab"
              accessibilityState={{ selected: bucket === b }}
              onPress={() => setBucket(b)}
              style={[styles.segmentItem, bucket === b && styles.segmentOn]}
            >
              <AppText weight="bold" color={bucket === b ? colors.text.onBrand : colors.text.primary}>
                {t(`vendor.bucket.${b}`)}
              </AppText>
            </Pressable>
          ))}
        </View>
      </View>
      <FlatList
        data={orders.data ?? []}
        keyExtractor={(o) => o.id}
        contentContainerStyle={styles.list}
        refreshing={orders.isRefetching}
        onRefresh={() => void orders.refetch()}
        ListEmptyComponent={
          orders.isPending ? (
            <LoadingState />
          ) : orders.isError ? (
            <ErrorState error={orders.error} onRetry={() => void orders.refetch()} />
          ) : (
            <EmptyState icon="receipt-outline" message={t(`vendor.no_orders.${bucket}`)} />
          )
        }
        renderItem={({ item: o }) => {
          const mins = Math.max(0, Math.floor((now - new Date(o.placed_at).getTime()) / 60000));
          const count = o.items.reduce((n, i) => n + i.quantity, 0);
          const addr = o.delivery_address as Record<string, string>;
          const waitingLong = o.status === 'placed' && mins >= 5;
          return (
            <Card
              style={waitingLong ? styles.urgent : undefined}
              onPress={() => router.push({ pathname: '/vendor/order/[id]', params: { id: o.id } })}
            >
              <View style={styles.rowBetween}>
                <AppText weight="bold">{o.order_number}</AppText>
                <OrderStatusBadge status={o.status} />
              </View>
              <AppText color={colors.text.secondary}>
                {t('cart.items', { count })} · {formatINR(o.total, lang)} · {t(`payment_method.${o.payment_method}`)}
              </AppText>
              <View style={styles.rowBetween}>
                <AppText variant="small" color={colors.text.secondary}>
                  {addr.locality}
                </AppText>
                <AppText variant="small" weight={waitingLong ? 'bold' : 'regular'} color={waitingLong ? colors.status.danger : colors.text.secondary}>
                  {t('vendor.minutes_ago', { count: mins })}
                </AppText>
              </View>
            </Card>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.background },
  pad: { padding: spacing.lg, gap: spacing.md },
  segment: { flexDirection: 'row', backgroundColor: colors.surface.sunken, borderRadius: radii.md, padding: 4 },
  segmentItem: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radii.sm },
  segmentOn: { backgroundColor: colors.brand.forest },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  urgent: { borderColor: colors.status.danger, borderWidth: 2 },
});
