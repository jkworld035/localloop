import { colors, formatINR, spacing } from '@localloop/shared';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';
import { BackRow } from '@/components/BackRow';
import { BillSummary } from '@/components/shop/BillSummary';
import { AppText, Banner, Button, Card, Chip, ErrorState, LoadingState, Screen, TextField } from '@/components/ui';
import { OrderStatusBadge } from '@/features/orders/OrderStatusBadge';
import { useMyStore, useVendorOrder, useVendorOrderAction } from '@/features/vendor/api';
import { errorMessage } from '@/lib/errors';

const PREP_OPTIONS = [10, 15, 20, 30, 45, 60];
const REJECT_REASONS = ['out_of_stock', 'closing', 'too_busy', 'other'] as const;

export default function VendorOrderDetail() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'te' ? 'te' : 'en';
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useMyStore();
  const order = useVendorOrder(id);
  const act = useVendorOrderAction(id);
  const [prep, setPrep] = useState<number | null>(null);
  const [mode, setMode] = useState<'none' | 'reject' | 'cancel'>('none');
  const [reasonKey, setReasonKey] = useState<(typeof REJECT_REASONS)[number]>('out_of_stock');
  const [reasonText, setReasonText] = useState('');

  if (order.isPending) return <LoadingState />;
  if (order.isError)
    return (
      <Screen edges={['top', 'bottom']}>
        <BackRow />
        <ErrorState error={order.error} onRetry={() => void order.refetch()} />
      </Screen>
    );

  const o = order.data;
  const addr = o.delivery_address as Record<string, string>;
  const prepMinutes = prep ?? store.data?.avg_prep_minutes ?? 15;
  const reason = reasonKey === 'other' ? reasonText.trim() : t(`vendor.reject_reasons.${reasonKey}`);
  const run = (a: Parameters<typeof act.mutate>[0]) => act.mutate(a, { onError: (e) => Alert.alert(errorMessage(e)), onSuccess: () => setMode('none') });

  const reasonPicker = (
    <Card>
      <AppText weight="bold">{mode === 'reject' ? t('vendor.reject_title') : t('vendor.cancel_title')}</AppText>
      <View style={styles.chips}>
        {REJECT_REASONS.map((r) => (
          <Chip key={r} label={t(`vendor.reject_reasons.${r}`)} selected={reasonKey === r} onPress={() => setReasonKey(r)} />
        ))}
      </View>
      {reasonKey === 'other' && <TextField label={t('vendor.reason')} value={reasonText} onChangeText={setReasonText} maxLength={300} />}
      <AppText variant="small" color={colors.text.secondary}>
        {t('vendor.reason_shared')}
      </AppText>
      <Button
        label={mode === 'reject' ? t('vendor.reject_order') : t('vendor.cancel_order')}
        variant="danger"
        disabled={reason.length < 3}
        loading={act.isPending}
        onPress={() => run(mode === 'reject' ? { kind: 'reject', reason } : { kind: 'cancel', reason })}
      />
      <Button label={t('common.back')} variant="ghost" compact onPress={() => setMode('none')} />
    </Card>
  );

  return (
    <Screen edges={['top', 'bottom']} refreshing={order.isRefetching} onRefresh={() => void order.refetch()}>
      <BackRow title={o.order_number} />
      <View style={styles.rowBetween}>
        <AppText color={colors.text.secondary}>
          {new Date(o.placed_at).toLocaleString(lang === 'te' ? 'te-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}
        </AppText>
        <OrderStatusBadge status={o.status} />
      </View>

      {/* Items: the packing list */}
      <Card>
        <AppText variant="title" weight="bold">
          {t('vendor.packing_list')}
        </AppText>
        {o.items.map((it) => (
          <View key={it.id} style={styles.item}>
            <AppText variant="title" weight="bold" style={styles.qty}>
              {it.quantity}×
            </AppText>
            <View style={styles.flex}>
              <AppText weight="medium">{it.product_name}</AppText>
              <AppText variant="small" color={colors.text.secondary}>
                {it.variant_label} · {formatINR(it.unit_price, lang)}
              </AppText>
            </View>
            <AppText weight="medium">{formatINR(it.line_total, lang)}</AppText>
          </View>
        ))}
        {!!o.delivery_instructions && <Banner tone="info" title={t('checkout.instructions')} message={o.delivery_instructions} />}
      </Card>

      {/* Actions by status */}
      {mode !== 'none' ? (
        reasonPicker
      ) : o.status === 'placed' ? (
        <Card>
          <AppText weight="bold">{t('vendor.prep_time')}</AppText>
          <View style={styles.chips}>
            {PREP_OPTIONS.map((m) => (
              <Chip key={m} label={t('vendor.minutes', { count: m })} selected={prepMinutes === m} onPress={() => setPrep(m)} />
            ))}
          </View>
          <Button label={t('vendor.accept_order', { minutes: prepMinutes })} icon="checkmark" loading={act.isPending} onPress={() => run({ kind: 'accept', prepMinutes })} />
          <Button label={t('vendor.reject_order')} variant="danger" onPress={() => setMode('reject')} />
        </Card>
      ) : o.status === 'accepted' || o.status === 'preparing' ? (
        <Card>
          {o.status === 'accepted' && (
            <Button label={t('vendor.mark_preparing')} variant="secondary" icon="restaurant-outline" loading={act.isPending} onPress={() => run({ kind: 'preparing' })} />
          )}
          <Button label={t('vendor.mark_ready')} icon="bag-check-outline" loading={act.isPending} onPress={() => run({ kind: 'ready' })} />
          <Button label={t('vendor.cancel_order')} variant="ghost" compact onPress={() => setMode('cancel')} />
        </Card>
      ) : o.status === 'ready_for_pickup' ? (
        <Card>
          <Banner tone="success" message={t('vendor.waiting_pickup')} />
          <Button label={t('vendor.cancel_order')} variant="ghost" compact onPress={() => setMode('cancel')} />
        </Card>
      ) : null}

      {/* Delivery partner */}
      {['accepted', 'preparing', 'ready_for_pickup'].includes(o.status) && (
        <Card>
          <AppText weight="bold">{t('vendor.delivery_partner')}</AppText>
          {o.assignment ? (
            <AppText color={colors.status.success}>{t('vendor.partner_on_way')}</AppText>
          ) : (
            <>
              <AppText color={colors.text.secondary}>{t('vendor.finding_partner')}</AppText>
              <Button label={t('vendor.request_partner')} variant="secondary" compact icon="bicycle-outline" loading={act.isPending} onPress={() => run({ kind: 'request_delivery' })} />
            </>
          )}
        </Card>
      )}
      {o.status === 'picked_up' && <Banner tone="info" message={t('vendor.out_for_delivery')} />}
      {o.status === 'rejected' && o.rejection_reason && <Banner tone="danger" message={t('order.reason', { reason: o.rejection_reason })} />}
      {o.status === 'cancelled' && o.cancel_reason && <Banner tone="danger" message={t('order.reason', { reason: o.cancel_reason })} />}

      <BillSummary subtotal={o.subtotal} deliveryFee={o.delivery_fee} discount={o.discount} tax={o.tax} total={o.total} />
      <Card>
        <AppText weight="bold">{t('order.delivery')}</AppText>
        <AppText>{addr.contact_name}</AppText>
        <AppText color={colors.text.secondary}>{[addr.locality, addr.city].filter(Boolean).join(', ')}</AppText>
        <AppText>
          {t(`payment_method.${o.payment_method}`)} · {t(`payment_status.${o.payment_status}`)}
        </AppText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48 },
  qty: { minWidth: 44 },
  flex: { flex: 1 },
});
