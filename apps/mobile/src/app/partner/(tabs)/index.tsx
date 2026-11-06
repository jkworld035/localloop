import { Ionicons } from '@expo/vector-icons';
import { colors, formatDistance, formatINR, radii, spacing } from '@localloop/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { VerificationStatus } from '@/components/VerificationStatus';
import { AppText, Banner, Button, Card, EmptyState, Screen } from '@/components/ui';
import {
  type Offer,
  useOffers,
  usePartner,
  usePartnerDashboard,
  useRespondToOffer,
  useSetOnline,
} from '@/features/partner/api';
import { errorMessage } from '@/lib/errors';
import { useNow } from '@/lib/useNow';
import { LocationError, openLocationSettings } from '@/services/location';
import { hasBackgroundPermission, requestBackgroundPermission } from '@/services/partner-tracking';

export default function PartnerHome() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'te' ? 'te' : 'en';
  const partner = usePartner();
  const p = partner.data!; // the tabs layout guarantees a registered partner
  const approved = p.status === 'approved';
  const setOnline = useSetOnline();
  const dash = usePartnerDashboard(approved);
  const offers = useOffers(approved && p.is_online);
  const [explainBackground, setExplainBackground] = useState(false);
  const [backgroundDenied, setBackgroundDenied] = useState(false);

  const goOnline = async () => {
    if (!(await hasBackgroundPermission())) return setExplainBackground(true);
    setOnline.mutate(true);
  };
  const afterExplanation = async () => {
    setExplainBackground(false);
    const granted = await requestBackgroundPermission();
    setBackgroundDenied(!granted);
    // Without "always" permission tracking still works while the app is open.
    setOnline.mutate(true);
  };
  const goOffline = () => {
    if (dash.data?.active_assignment_id) return Alert.alert(t('errors.active_delivery_in_progress'));
    setOnline.mutate(false);
  };

  const onlineError = setOnline.error;
  const locationProblem = onlineError instanceof LocationError ? onlineError.reason : null;
  const refresh = () => {
    void partner.refetch();
    void dash.refetch();
    void offers.refetch();
  };

  return (
    <Screen refreshing={partner.isRefetching || dash.isRefetching} onRefresh={refresh}>
      <AppText variant="heading" weight="bold" accessibilityRole="header">
        {t(`vehicles.${p.vehicle_type}`)}
        {p.vehicle_registration ? ` · ${p.vehicle_registration}` : ''}
      </AppText>

      {!approved ? (
        <>
          <VerificationStatus
            status={p.status as Exclude<typeof p.status, 'approved'>}
            reason={p.status_reason}
            pendingBody={t('partner.pending_body')}
            titles={{ pending: t('partner.pending_title'), rejected: t('vendor.rejected_title'), suspended: t('vendor.suspended_title') }}
          />
          <Button label={t('partner.documents')} variant="secondary" icon="document-text-outline" onPress={() => router.push('/partner/documents')} />
          {p.status === 'rejected' && <Button label={t('vendor.edit_and_resubmit')} onPress={() => router.push('/partner/register')} />}
        </>
      ) : (
        <>
          {/* Active delivery comes first: it's what the partner should be doing right now. */}
          {dash.data?.active_assignment_id && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('partner.active_job_open')}
              onPress={() => router.push({ pathname: '/partner/job/[id]', params: { id: dash.data!.active_assignment_id! } })}
            >
              <Card style={styles.activeJob}>
                <View style={styles.row}>
                  <Ionicons name="navigate" size={28} color={colors.text.onBrand} />
                  <View style={styles.flex}>
                    <AppText variant="title" weight="bold" color={colors.text.onBrand}>
                      {t('partner.active_job')}
                    </AppText>
                    <AppText color={colors.text.onBrand}>{t('partner.active_job_open')}</AppText>
                  </View>
                  <Ionicons name="chevron-forward" size={24} color={colors.text.onBrand} />
                </View>
              </Card>
            </Pressable>
          )}

          <Card style={[styles.status, p.is_online && styles.statusOnline]}>
            <View style={styles.row}>
              <View style={[styles.dot, { backgroundColor: p.is_online ? colors.status.success : colors.text.muted }]} />
              <AppText variant="title" weight="bold">
                {p.is_online ? t('partner.online') : t('partner.offline')}
              </AppText>
            </View>
            <AppText color={colors.text.secondary}>{p.is_online ? t('partner.online_hint') : t('partner.offline_hint')}</AppText>
            <Button
              label={p.is_online ? t('partner.go_offline') : t('partner.go_online')}
              variant={p.is_online ? 'secondary' : 'primary'}
              icon={p.is_online ? 'pause-circle-outline' : 'radio-outline'}
              loading={setOnline.isPending}
              onPress={() => (p.is_online ? goOffline() : void goOnline())}
            />
          </Card>

          {explainBackground && (
            <Card>
              <View style={styles.row}>
                <Ionicons name="navigate-circle-outline" size={32} color={colors.brand.forest} />
                <AppText variant="title" weight="bold" style={styles.flex}>
                  {t('partner.background_permission_title')}
                </AppText>
              </View>
              <AppText>{t('partner.background_permission_body')}</AppText>
              <Button label={t('common.continue')} onPress={() => void afterExplanation()} />
              <Button label={t('common.cancel')} variant="ghost" compact onPress={() => setExplainBackground(false)} />
            </Card>
          )}

          {backgroundDenied && <Banner tone="warning" message={t('partner.background_permission_denied')} />}
          {locationProblem ? (
            <Banner
              tone="warning"
              message={t(locationProblem === 'services_off' ? 'location.services_off' : locationProblem === 'permission_denied' ? 'location.permission_denied' : 'location.timeout')}
              actionLabel={t('location.open_settings')}
              onAction={openLocationSettings}
            />
          ) : (
            setOnline.isError && <Banner tone="danger" message={errorMessage(onlineError)} />
          )}

          {/* Offers */}
          {p.is_online && !dash.data?.active_assignment_id && (
            <>
              <AppText variant="title" weight="bold" accessibilityRole="header">
                {t('partner.offers')}
              </AppText>
              {offers.isError ? (
                <Banner tone="danger" message={errorMessage(offers.error)} actionLabel={t('common.retry')} onAction={() => void offers.refetch()} />
              ) : offers.data && offers.data.length > 0 ? (
                offers.data.map((o) => <OfferCard key={o.assignment_id} offer={o} lang={lang} />)
              ) : (
                <EmptyState icon="hourglass-outline" message={t('partner.no_offers')} />
              )}
            </>
          )}

          {/* Today */}
          {dash.data && (
            <Card>
              <AppText weight="bold">{t('partner.today')}</AppText>
              <View style={styles.stats}>
                <Stat label={t('partner.deliveries')} value={String(dash.data.deliveries_today)} />
                <Stat label={t('partner.earnings')} value={formatINR(Number(dash.data.earnings_today), lang)} />
                <Stat label={t('partner.cash_in_hand')} value={formatINR(Number(dash.data.cash_in_hand), lang)} />
              </View>
              <AppText variant="small" color={colors.text.secondary}>
                {t('partner.week_summary', { count: dash.data.deliveries_7d, amount: formatINR(Number(dash.data.earnings_7d), lang) })}
              </AppText>
              {dash.data.rating_count > 0 && (
                <AppText variant="small" color={colors.text.secondary}>
                  {t('partner.rating', { rating: Number(dash.data.rating_avg).toFixed(1), count: dash.data.rating_count })}
                </AppText>
              )}
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label}: ${value}`}>
      <AppText variant="title" weight="bold">
        {value}
      </AppText>
      <AppText variant="small" color={colors.text.secondary}>
        {label}
      </AppText>
    </View>
  );
}

/** One delivery request. The countdown is the server's expiry, not a client timer. */
function OfferCard({ offer, lang }: { offer: Offer; lang: 'en' | 'te' }) {
  const { t } = useTranslation();
  const now = useNow(1000);
  const respond = useRespondToOffer();
  const secondsLeft = Math.max(0, Math.round((new Date(offer.expires_at).getTime() - now) / 1000));
  const toStore = formatDistance(offer.distance_to_store_m);
  const trip = formatDistance(offer.trip_distance_m);
  const expired = secondsLeft === 0;

  const accept = () =>
    respond.mutate(
      { assignmentId: offer.assignment_id, accept: true },
      {
        onSuccess: (r) => {
          if (r.ok) router.push({ pathname: '/partner/job/[id]', params: { id: offer.assignment_id } });
          else Alert.alert(errorMessage({ message: r.error }));
        },
        onError: (e) => Alert.alert(errorMessage(e)),
      },
    );

  return (
    <Card style={styles.offer}>
      <View style={styles.rowBetween}>
        <AppText variant="title" weight="bold" style={styles.flex}>
          {offer.store_name}
        </AppText>
        <View style={[styles.timer, secondsLeft <= 10 && styles.timerUrgent]} accessibilityLiveRegion="polite">
          <AppText weight="bold" color={secondsLeft <= 10 ? colors.status.danger : colors.text.primary}>
            {t('partner.seconds_left', { count: secondsLeft })}
          </AppText>
        </View>
      </View>
      <AppText color={colors.text.secondary}>
        {t('partner.offer_route', { from: offer.store_locality ?? '', to: offer.delivery_locality ?? '' })}
      </AppText>
      <AppText>
        {t('partner.offer_distances', {
          toStore: `${toStore.value} ${t(`common.${toStore.unit}`)}`,
          trip: `${trip.value} ${t(`common.${trip.unit}`)}`,
        })}
      </AppText>
      <AppText color={colors.text.secondary}>
        {t('partner.items', { count: offer.item_count ?? 0 })}
        {offer.payment_method === 'cod' ? ` · ${t('partner.collect_cash', { amount: formatINR(Number(offer.cash_to_collect), lang) })}` : ` · ${t('partner.prepaid')}`}
      </AppText>
      <View style={styles.actions}>
        <View style={styles.flex}>
          <Button
            label={t('partner.reject')}
            variant="secondary"
            disabled={respond.isPending || expired}
            onPress={() => respond.mutate({ assignmentId: offer.assignment_id, accept: false }, { onError: (e) => Alert.alert(errorMessage(e)) })}
          />
        </View>
        <View style={styles.flex}>
          <Button label={t('partner.accept')} icon="checkmark" loading={respond.isPending} disabled={expired} onPress={accept} />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  status: { gap: spacing.md },
  statusOnline: { borderColor: colors.status.success, borderWidth: 2 },
  activeJob: { backgroundColor: colors.brand.forest },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  dot: { width: 14, height: 14, borderRadius: radii.pill },
  flex: { flex: 1 },
  stats: { flexDirection: 'row', gap: spacing.md },
  stat: { flex: 1, gap: 2 },
  offer: { borderColor: colors.brand.forest, borderWidth: 2, gap: spacing.sm },
  timer: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radii.pill, backgroundColor: colors.surface.background },
  timerUrgent: { backgroundColor: '#FDECEA' },
  actions: { flexDirection: 'row', gap: spacing.sm },
});
