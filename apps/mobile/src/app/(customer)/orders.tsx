import { colors, formatINR, spacing } from '@localloop/shared';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { AppText, Card, EmptyState, ErrorState, LoadingState, Screen } from '@/components/ui';
import { useMyOrders } from '@/features/orders/api';
import { OrderStatusBadge } from '@/features/orders/OrderStatusBadge';

export default function Orders() {
  const { t, i18n } = useTranslation();
  const te = i18n.language === 'te';
  const orders = useMyOrders();
  const dateFmt = new Intl.DateTimeFormat(te ? 'te-IN' : 'en-IN', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <Screen refreshing={orders.isRefetching} onRefresh={() => void orders.refetch()}>
      <AppText variant="heading" weight="bold" accessibilityRole="header">
        {t('orders.title')}
      </AppText>
      {orders.isPending ? (
        <LoadingState />
      ) : orders.isError ? (
        <ErrorState error={orders.error} onRetry={() => void orders.refetch()} />
      ) : orders.data.length === 0 ? (
        <EmptyState
          icon="receipt-outline"
          message={t('orders.empty')}
          actionLabel={t('orders.start_shopping')}
          onAction={() => router.navigate('/home')}
        />
      ) : (
        <View style={styles.list}>
          {orders.data.map((o) => (
            <Card key={o.id} onPress={() => router.push({ pathname: '/order/[id]', params: { id: o.id } })}>
              <View style={styles.row}>
                <AppText weight="bold" style={styles.flex} numberOfLines={1}>
                  {(te && o.store?.name_te) || o.store?.name}
                </AppText>
                <OrderStatusBadge status={o.status} />
              </View>
              <AppText variant="small" color={colors.text.secondary}>
                {o.order_number} · {t('orders.placed_on', { date: dateFmt.format(new Date(o.placed_at)) })}
              </AppText>
              <AppText weight="medium">{formatINR(o.total, te ? 'te' : 'en')}</AppText>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
