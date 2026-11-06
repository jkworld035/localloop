import { Ionicons } from '@expo/vector-icons';
import { colors, formatDistance, formatINR, spacing } from '@localloop/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';
import { BackRow } from '@/components/BackRow';
import { DeliveryMap } from '@/components/DeliveryMap';
import { AppText, Banner, Button, Card, ErrorState, LoadingState, Screen, TextField } from '@/components/ui';
import { useActiveJob, useActiveJobRealtime, useCompleteDelivery, useConfirmPickup, usePartner } from '@/features/partner/api';
import { requestEta } from '@/features/tracking/api';
import { errorMessage } from '@/lib/errors';
import { useNow } from '@/lib/useNow';
import { callNumber, openNavigation } from '@/services/navigation';

/**
 * The partner's working screen for one delivery: go to the shop, confirm
 * pickup there, go to the customer, collect the OTP (and cash), complete.
 * Pickup and completion are geofenced on the server against fresh GPS.
 */
export default function PartnerJob() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'te' ? 'te' : 'en';
  const { id } = useLocalSearchParams<{ id: string }>();
  const partner = usePartner();
  const job = useActiveJob(id);
  useActiveJobRealtime(job.data);
  const pickup = useConfirmPickup(id);
  const complete = useCompleteDelivery(id);
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [earned, setEarned] = useState<number | null>(null);
  const now = useNow(15_000);
  const leg = job.data?.status;

  // Route and ETA for the current leg (shop first, then customer); the server throttles provider calls.
  useEffect(() => {
    if (leg) void requestEta(id);
  }, [id, leg]);

  if (earned != null) {
    return (
      <Screen edges={['top', 'bottom']}>
        <View style={styles.done}>
          <Ionicons name="checkmark-circle" size={88} color={colors.status.success} />
          <AppText variant="heading" weight="bold" align="center" accessibilityRole="header">
            {t('partner.delivered_title')}
          </AppText>
          <AppText variant="title" align="center">
            {t('partner.you_earned', { amount: formatINR(earned, lang) })}
          </AppText>
          {job.data && job.data.cash_to_collect > 0 && (
            <Banner tone="info" message={t('partner.cash_reminder', { amount: formatINR(Number(job.data.cash_to_collect), lang) })} />
          )}
        </View>
        <Button label={t('partner.back_home')} onPress={() => router.replace('/partner')} />
      </Screen>
    );
  }

  if (job.isPending) return <LoadingState />;
  if (job.isError)
    return (
      <Screen edges={['top', 'bottom']}>
        <BackRow />
        <ErrorState error={job.error} onRetry={() => void job.refetch()} />
        <Button label={t('partner.back_home')} variant="secondary" onPress={() => router.replace('/partner')} />
      </Screen>
    );

  const j = job.data;
  const vehicle = partner.data?.vehicle_type ?? 'scooter';
  const atStoreLeg = j.status === 'accepted';
  const ready = j.order_status === 'ready_for_pickup';
  const drop = j.drop;
  const dropAddress = [drop.line1, drop.line2, drop.landmark && t('partner.near', { landmark: drop.landmark }), drop.locality, drop.city, drop.pincode]
    .filter(Boolean)
    .join(', ');
  const etaFresh = j.eta_seconds != null && j.eta_computed_at != null;
  const etaMin = etaFresh ? Math.max(1, Math.round((new Date(j.eta_computed_at!).getTime() + j.eta_seconds! * 1000 - now) / 60000)) : null;
  const remaining = j.remaining_distance_m != null ? formatDistance(j.remaining_distance_m) : null;

  const confirmPickup = () =>
    pickup.mutate(undefined, {
      onError: (e) => Alert.alert(errorMessage(e)),
    });

  const submitOtp = () => {
    setOtpError(null);
    complete.mutate(otp.trim(), {
      onSuccess: (r) => {
        if (r.ok) setEarned(Number(r.earning));
        else if (r.error === 'otp_incorrect') setOtpError(t('partner.otp_wrong', { count: r.attempts_left ?? 0 }));
        else setOtpError(errorMessage({ message: r.error }));
      },
      onError: (e) => setOtpError(errorMessage(e)),
    });
  };

  return (
    <Screen edges={['top', 'bottom']} refreshing={job.isRefetching} onRefresh={() => void job.refetch()}>
      <BackRow title={j.order_number} />

      <DeliveryMap
        style={styles.map}
        store={j.store}
        drop={drop}
        polyline={j.route_polyline}
        showsUserLocation
        accessibilityLabel={t('partner.map_label')}
        storeLabel={j.store.name}
        dropLabel={drop.contact_name}
      />
      {(etaMin != null || remaining) && (
        <AppText weight="medium" accessibilityLiveRegion="polite">
          {[
            etaMin != null ? t('partner.eta_minutes', { count: etaMin }) : null,
            remaining ? `${remaining.value} ${t(`common.${remaining.unit}`)}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </AppText>
      )}

      {/* Step indicator */}
      <View style={styles.steps} accessible accessibilityLabel={atStoreLeg ? t('partner.step_pickup') : t('partner.step_deliver')}>
        <Step n={1} label={t('partner.step_pickup')} active={atStoreLeg} done={!atStoreLeg} />
        <View style={styles.stepLine} />
        <Step n={2} label={t('partner.step_deliver')} active={!atStoreLeg} done={false} />
      </View>

      {atStoreLeg ? (
        <Card>
          <AppText variant="small" color={colors.text.secondary}>
            {t('partner.pickup_from')}
          </AppText>
          <AppText variant="title" weight="bold">
            {j.store.name}
          </AppText>
          {!!j.store.address && <AppText color={colors.text.secondary}>{j.store.address}</AppText>}
          <View style={styles.actions}>
            <View style={styles.flex}>
              <Button label={t('partner.navigate')} icon="navigate-outline" onPress={() => void openNavigation(j.store, vehicle)} />
            </View>
            {!!j.store.phone && (
              <View style={styles.flex}>
                <Button label={t('partner.call_shop')} variant="secondary" icon="call-outline" onPress={() => void callNumber(j.store.phone)} />
              </View>
            )}
          </View>
          <Banner tone={ready ? 'success' : 'info'} message={ready ? t('partner.order_ready') : t('partner.order_preparing')} />
          <Button label={t('partner.confirm_pickup')} icon="bag-check-outline" loading={pickup.isPending} onPress={confirmPickup} />
          <AppText variant="small" color={colors.text.secondary}>
            {t('partner.pickup_hint')}
          </AppText>
        </Card>
      ) : (
        <Card>
          <AppText variant="small" color={colors.text.secondary}>
            {t('partner.deliver_to')}
          </AppText>
          <AppText variant="title" weight="bold">
            {drop.contact_name}
          </AppText>
          <AppText>{dropAddress}</AppText>
          {!!drop.instructions && <Banner tone="info" title={t('checkout.instructions')} message={drop.instructions} />}
          <View style={styles.actions}>
            <View style={styles.flex}>
              <Button label={t('partner.navigate')} icon="navigate-outline" onPress={() => void openNavigation(drop, vehicle)} />
            </View>
            {!!drop.contact_phone && (
              <View style={styles.flex}>
                <Button label={t('partner.call_customer')} variant="secondary" icon="call-outline" onPress={() => void callNumber(drop.contact_phone)} />
              </View>
            )}
          </View>

          {j.cash_to_collect > 0 ? (
            <Banner tone="warning" title={t('partner.collect_cash_title')} message={formatINR(Number(j.cash_to_collect), lang)} />
          ) : (
            <Banner tone="success" message={t('partner.prepaid_no_cash')} />
          )}

          <TextField
            label={t('partner.otp_label')}
            hint={t('partner.otp_hint')}
            value={otp}
            onChangeText={(v) => setOtp(v.replace(/\D/g, '').slice(0, 4))}
            keyboardType="number-pad"
            maxLength={4}
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
          />
          {otpError && <Banner tone="danger" message={otpError} />}
          <Button label={t('partner.complete_delivery')} icon="checkmark-done" disabled={otp.length !== 4} loading={complete.isPending} onPress={submitOtp} />
        </Card>
      )}

      <Card>
        <AppText weight="bold">{t('partner.items', { count: j.items.reduce((s, it) => s + it.quantity, 0) })}</AppText>
        {j.items.map((it, i) => (
          <AppText key={`${it.name}-${i}`}>
            {it.quantity}× {it.name}
            {it.variant ? ` · ${it.variant}` : ''}
          </AppText>
        ))}
      </Card>
    </Screen>
  );
}

function Step({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  const bg = done ? colors.status.success : active ? colors.brand.forest : colors.surface.card;
  return (
    <View style={styles.step}>
      <View style={[styles.stepDot, { backgroundColor: bg, borderColor: done || active ? bg : colors.text.muted }]}>
        {done ? (
          <Ionicons name="checkmark" size={16} color="#FFFFFF" />
        ) : (
          <AppText variant="small" weight="bold" color={active ? '#FFFFFF' : colors.text.secondary}>
            {n}
          </AppText>
        )}
      </View>
      <AppText variant="small" weight={active ? 'bold' : 'regular'}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  map: { height: 260, borderRadius: 16 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  steps: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  stepDot: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  stepLine: { flex: 1, height: 2, backgroundColor: colors.text.muted },
  done: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, paddingVertical: spacing.xxxl },
});
