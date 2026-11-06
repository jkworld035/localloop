import { Ionicons } from '@expo/vector-icons';
import { colors, formatINR, radii, spacing, TERMINAL_ORDER_STATUSES, type OrderStatus } from '@localloop/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';
import { BackRow } from '@/components/BackRow';
import { BillSummary } from '@/components/shop/BillSummary';
import { AppText, Banner, Button, Card, ErrorState, LoadingState, Screen } from '@/components/ui';
import { OrderStatusBadge } from '@/features/orders/OrderStatusBadge';
import { useCancelOrder, useDeliveryOtp, useOrder, useOrderRealtime } from '@/features/orders/api';
import { errorMessage } from '@/lib/errors';

/** Happy-path steps shown as a progress list; rejected/cancelled show as a single closing state. */
const STEPS: OrderStatus[] = ['placed', 'accepted', 'preparing', 'ready_for_pickup', 'picked_up', 'delivered'];

export default function OrderDetail() {
  const { t, i18n } = useTranslation();
  const te = i18n.language === 'te';
  const lang = te ? 'te' : 'en';
  const { id, placed } = useLocalSearchParams<{ id: string; placed?: string }>();
  const order = useOrder(id);
  useOrderRealtime(id);
  const open = !!order.data && !TERMINAL_ORDER_STATUSES.includes(order.data.status);
  const otp = useDeliveryOtp(id, open);
  const cancel = useCancelOrder(id);

  if (order.isPending) return <LoadingState />;
  if (order.isError)
    return (
      <Screen edges={['top', 'bottom']}>
        <BackRow />
        <ErrorState error={order.error} onRetry={() => void order.refetch()} />
      </Screen>
    );

  const o = order.data;
  const storeName = (te && o.store?.name_te) || o.store?.name || '';
  const reached = new Map(o.history.map((h) => [h.to_status, h.created_at] as const));
  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString(te ? 'te-IN' : 'en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  const closed = o.status === 'rejected' || o.status === 'cancelled';
  const addr = o.delivery_address as Record<string, string>;

  const confirmCancel = () =>
    Alert.alert(t('order.cancel_confirm_title'), t('order.cancel_confirm_body'), [
      { text: t('common.back'), style: 'cancel' },
      {
        text: t('order.cancel'),
        style: 'destructive',
        onPress: () => cancel.mutate(t('order.cancel_reason_default'), { onError: (e) => Alert.alert(errorMessage(e)) }),
      },
    ]);

  return (
    <Screen
      edges={['top', 'bottom']}
      refreshing={order.isRefetching}
      onRefresh={() => void order.refetch()}
      footer={
        placed === '1' ? (
          <Button label={t('order.continue_shopping')} variant="secondary" onPress={() => router.replace('/home')} />
        ) : undefined
      }
    >
      <BackRow title={t('order.title')} />

      {placed === '1' && (
        <Card style={styles.placed}>
          <Ionicons name="checkmark-circle" size={48} color={colors.status.success} />
          <AppText variant="heading" weight="bold" align="center">
            {t('order.placed_title')}
          </AppText>
          <AppText align="center" color={colors.text.secondary}>
            {t('order.placed_body', { store: storeName })}
          </AppText>
        </Card>
      )}

      <View style={styles.rowBetween}>
        <View style={styles.flex}>
          <AppText variant="title" weight="bold">
            {storeName}
          </AppText>
          <AppText variant="small" color={colors.text.secondary}>
            {o.order_number}
          </AppText>
        </View>
        <OrderStatusBadge status={o.status} />
      </View>

      {o.status === 'accepted' && o.prep_time_minutes != null && (
        <Banner tone="info" message={t('order.prep_eta', { minutes: o.prep_time_minutes })} />
      )}
      {o.status === 'rejected' && o.rejection_reason && <Banner tone="danger" message={t('order.reason', { reason: o.rejection_reason })} />}
      {o.status === 'cancelled' && o.cancel_reason && <Banner tone="danger" message={t('order.reason', { reason: o.cancel_reason })} />}

      {/* Live tracking: the map shows the partner once the order is picked up */}
      {o.status === 'picked_up' ? (
        <Button label={t('tracking.track_live')} icon="navigate" onPress={() => router.push({ pathname: '/track/[id]', params: { id } })} />
      ) : (
        ['accepted', 'preparing', 'ready_for_pickup'].includes(o.status) && (
          <Button
            label={t('tracking.view_progress')}
            variant="secondary"
            icon="map-outline"
            onPress={() => router.push({ pathname: '/track/[id]', params: { id } })}
          />
        )
      )}

      {/* Delivery code: shown only while the order is open */}
      {open && otp.data && (
        <Card style={styles.otpCard}>
          <AppText weight="bold">{t('order.otp_title')}</AppText>
          <AppText variant="display" weight="bold" color={colors.brand.forest} style={styles.otp} accessibilityLabel={otp.data.split('').join(' ')}>
            {otp.data}
          </AppText>
          <AppText variant="small" color={colors.text.secondary}>
            {t('order.otp_hint')}
          </AppText>
        </Card>
      )}

      {/* Timeline */}
      <Card>
        <AppText variant="title" weight="bold">
          {t('order.timeline')}
        </AppText>
        {closed ? (
          <>
            <Step done label={t('order_status.placed')} at={reached.get('placed') ? time(reached.get('placed')!) : undefined} />
            <Step done failed label={t(`order_status.${o.status}`)} at={reached.get(o.status) ? time(reached.get(o.status)!) : undefined} />
          </>
        ) : (
          STEPS.map((s, i) => {
            const done = reached.has(s) || STEPS.indexOf(o.status) >= i;
            return (
              <Step
                key={s}
                done={done}
                current={o.status === s}
                label={t(`order_status.${s}`)}
                at={reached.get(s) ? time(reached.get(s)!) : undefined}
                last={i === STEPS.length - 1}
              />
            );
          })
        )}
        {open && (
          <AppText variant="small" color={colors.text.secondary}>
            {t('order.live_updates')}
          </AppText>
        )}
      </Card>

      {/* Items */}
      <Card>
        <AppText variant="title" weight="bold">
          {t('order.items')}
        </AppText>
        {o.items.map((it) => (
          <View key={it.id} style={styles.rowBetween}>
            <AppText style={styles.flex}>
              {it.quantity} × {it.product_name} ({it.variant_label})
            </AppText>
            <AppText weight="medium">{formatINR(it.line_total, lang)}</AppText>
          </View>
        ))}
      </Card>

      <BillSummary subtotal={o.subtotal} deliveryFee={o.delivery_fee} discount={o.discount} tax={o.tax} total={o.total} />

      <Card>
        <AppText variant="title" weight="bold">
          {t('order.delivery')}
        </AppText>
        <AppText weight="medium">
          {addr.label} · {addr.contact_name}
        </AppText>
        <AppText color={colors.text.secondary}>
          {[addr.line1, addr.line2, addr.landmark, addr.locality, `${addr.city} ${addr.pincode}`].filter(Boolean).join(', ')}
        </AppText>
        {!!o.delivery_instructions && (
          <AppText variant="small" color={colors.text.secondary}>
            “{o.delivery_instructions}”
          </AppText>
        )}
        <View style={styles.rowBetween}>
          <AppText>{t(`payment_method.${o.payment_method}`)}</AppText>
          <AppText weight="medium">{t(`payment_status.${o.payment_status}`)}</AppText>
        </View>
      </Card>

      {o.status === 'placed' && (
        <Button label={t('order.cancel')} variant="danger" icon="close-circle-outline" loading={cancel.isPending} onPress={confirmCancel} />
      )}
    </Screen>
  );
}

function Step({ label, at, done, current, failed, last }: { label: string; at?: string; done: boolean; current?: boolean; failed?: boolean; last?: boolean }) {
  const color = failed ? colors.status.danger : done ? colors.brand.forest : colors.surface.borderStrong;
  return (
    <View style={styles.step} accessible accessibilityLabel={`${label}${at ? `, ${at}` : ''}`} accessibilityState={{ selected: !!current }}>
      <View style={styles.stepRail}>
        <Ionicons name={failed ? 'close-circle' : done ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={color} />
        {!last && !failed && <View style={[styles.stepLine, { backgroundColor: done ? colors.brand.forest : colors.surface.border }]} />}
      </View>
      <View style={styles.flex}>
        <AppText weight={current ? 'bold' : 'regular'} color={done || failed ? colors.text.primary : colors.text.muted}>
          {label}
        </AppText>
        {at && (
          <AppText variant="caption" color={colors.text.secondary}>
            {at}
          </AppText>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  placed: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  otpCard: { alignItems: 'center', borderColor: colors.brand.forest, borderWidth: 2 },
  otp: { letterSpacing: 12 },
  step: { flexDirection: 'row', gap: spacing.md, minHeight: 44 },
  stepRail: { alignItems: 'center', width: 22 },
  stepLine: { flex: 1, width: 2, marginVertical: 2, borderRadius: radii.pill },
});
