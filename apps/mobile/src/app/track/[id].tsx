import { Ionicons } from '@expo/vector-icons';
import { arrivalEstimate, colors, elevation, formatDistance, locationFreshness, radii, spacing } from '@localloop/shared';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DeliveryMap } from '@/components/DeliveryMap';
import { AppText, Banner, Button, Card, ErrorState, LoadingState } from '@/components/ui';
import { requestEta, useTracking, useTrackingRealtime, type EtaRequestResult, type TrackingPartner } from '@/features/tracking/api';
import { supabase } from '@/lib/supabase';
import { useNow } from '@/lib/useNow';

/**
 * Customer live tracking. The partner's position comes from their phone's GPS
 * via Realtime; the ETA is a road-route estimate from the Routes API computed
 * on the server. When either is missing or old, the screen says so instead of
 * guessing.
 */
export default function TrackOrder() {
  const { t, i18n } = useTranslation();
  const te = i18n.language === 'te';
  const { id } = useLocalSearchParams<{ id: string }>();
  const tracking = useTracking(id);
  const a = tracking.data?.assignment ?? null;
  useTrackingRealtime(id, a?.id);
  const now = useNow(5000);
  const [etaRequest, setEtaRequest] = useState<EtaRequestResult | null>(null);
  const outForDelivery = tracking.data?.status === 'picked_up';

  // A fresh routed ETA on open (the server throttles provider calls).
  useEffect(() => {
    if (outForDelivery && a?.id) void requestEta(a.id, true).then(setEtaRequest);
  }, [outForDelivery, a?.id]);

  if (tracking.isPending) return <LoadingState />;
  if (tracking.isError)
    return (
      <SafeAreaView style={styles.root}>
        <ErrorState error={tracking.error} onRetry={() => void tracking.refetch()} />
      </SafeAreaView>
    );

  const tr = tracking.data;
  const partnerPos = a?.latitude != null && a.longitude != null ? { latitude: a.latitude, longitude: a.longitude } : null;
  const freshness = outForDelivery ? locationFreshness(a?.location_at ?? null, new Date(now)) : null;
  // ETA only while the position behind it is current.
  const estimate = outForDelivery && a ? arrivalEstimate(a, new Date(now)) : null;
  const arrival = estimate?.arrival ?? null;
  const minutes = estimate?.minutes ?? null;
  const remaining = outForDelivery && a?.remaining_distance_m != null ? formatDistance(a.remaining_distance_m) : null;
  const ageS = a?.location_at ? Math.max(0, Math.round((now - new Date(a.location_at).getTime()) / 1000)) : null;
  const time = (d: Date) => d.toLocaleTimeString(te ? 'te-IN' : 'en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

  const headline =
    tr.status === 'delivered'
      ? t('tracking.delivered')
      : tr.status === 'cancelled' || tr.status === 'rejected'
        ? t('tracking.cancelled')
      : outForDelivery
        ? t('tracking.on_the_way')
        : a
          ? t('tracking.partner_to_store')
          : t('tracking.finding_partner');

  return (
    <View style={styles.root}>
      <DeliveryMap
        style={styles.map}
        store={tr.store}
        drop={tr.destination}
        partner={outForDelivery ? partnerPos : null}
        heading={a?.heading}
        polyline={outForDelivery ? a?.route_polyline : null}
        partnerStale={freshness !== 'live'}
        accessibilityLabel={t('tracking.map_label')}
        storeLabel={tr.store.name}
        dropLabel={t('tracking.your_location')}
        partnerLabel={a?.partner?.name}
      />
      <SafeAreaView edges={['top']} style={styles.top} pointerEvents="box-none">
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
        </Pressable>
      </SafeAreaView>

      <SafeAreaView edges={['bottom']} style={styles.sheet}>
        <ScrollView contentContainerStyle={styles.sheetContent}>
          <AppText variant="small" color={colors.text.secondary}>
            {tr.order_number} · {tr.store.name}
          </AppText>
          <AppText variant="heading" weight="bold" accessibilityRole="header" accessibilityLiveRegion="polite">
            {minutes != null ? t('tracking.arriving_in', { count: minutes }) : headline}
          </AppText>
          {minutes != null && (
            <AppText color={colors.text.secondary}>
              {[t('tracking.arrives_at', { time: time(arrival!) }), remaining ? `${remaining.value} ${t(`common.${remaining.unit}`)}` : null]
                .filter(Boolean)
                .join(' · ')}
            </AppText>
          )}

          {/* Honest freshness: live / last seen / waiting */}
          {outForDelivery && (
            <View style={styles.row} accessibilityLiveRegion="polite">
              <View
                style={[
                  styles.dot,
                  { backgroundColor: freshness === 'live' ? colors.status.success : freshness === 'stale' ? colors.status.warning : colors.text.muted },
                ]}
              />
              <AppText variant="small" color={colors.text.secondary}>
                {!a?.location_at
                  ? t('tracking.waiting_location')
                  : freshness === 'live'
                    ? `${t('tracking.live')} · ${t('tracking.updated_ago', { seconds: ageS })}`
                    : t('tracking.last_seen', { minutes: Math.max(1, Math.round((ageS ?? 0) / 60)) })}
              </AppText>
            </View>
          )}
          {outForDelivery && freshness !== 'live' && a?.location_at && <Banner tone="warning" message={t('tracking.signal_weak')} />}
          {outForDelivery && freshness === 'live' && !a?.eta_seconds && etaRequest && etaRequest !== 'ok' && <Banner tone="info" message={t('tracking.eta_unavailable')} />}
          {!outForDelivery && ['accepted', 'preparing', 'ready_for_pickup'].includes(tr.status) && tr.prep_time_minutes != null && tr.accepted_at && (
            <Banner
              tone="info"
              message={t('tracking.prep_until', { time: time(new Date(new Date(tr.accepted_at).getTime() + tr.prep_time_minutes * 60000)) })}
            />
          )}

          {a?.partner && <PartnerCard partner={a.partner} />}

          <Button label={t('tracking.order_details')} variant="secondary" icon="receipt-outline" onPress={() => router.replace({ pathname: '/order/[id]', params: { id } })} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function PartnerCard({ partner }: { partner: TrackingPartner }) {
  const { t } = useTranslation();
  const photo = partner.avatar_path ? supabase.storage.from('avatars').getPublicUrl(partner.avatar_path).data.publicUrl : null;
  return (
    <Card>
      <View style={styles.row}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.avatar} accessibilityIgnoresInvertColors />
        ) : (
          <View style={[styles.avatar, styles.avatarEmpty]}>
            <Ionicons name="person" size={28} color={colors.text.muted} />
          </View>
        )}
        <View style={styles.flex}>
          <AppText weight="bold">{partner.name}</AppText>
          <AppText variant="small" color={colors.text.secondary}>
            {t(`vehicles.${partner.vehicle_type}`)}
            {partner.vehicle_registration_tail ? ` · ••${partner.vehicle_registration_tail}` : ''}
          </AppText>
          {partner.rating_count > 0 && (
            <AppText variant="small" color={colors.text.secondary}>
              {t('partner.rating', { rating: Number(partner.rating_avg).toFixed(1), count: partner.rating_count })}
            </AppText>
          )}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.background },
  map: { flex: 1 },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: spacing.lg },
  back: {
    marginTop: spacing.sm,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.card,
  },
  sheet: {
    maxHeight: '55%',
    backgroundColor: colors.surface.card,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    marginTop: -radii.xl,
    ...elevation.card,
  },
  sheetContent: { padding: spacing.lg, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dot: { width: 10, height: 10, borderRadius: 5 },
  flex: { flex: 1 },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  avatarEmpty: { backgroundColor: colors.surface.background, alignItems: 'center', justifyContent: 'center' },
});
