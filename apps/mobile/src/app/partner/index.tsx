import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing } from '@localloop/shared';
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { VerificationStatus } from '@/components/VerificationStatus';
import { AppText, Banner, Button, Card, ErrorState, LoadingState, Screen } from '@/components/ui';
import { reconcileTracking, usePartner, useSetOnline } from '@/features/partner/api';
import { errorMessage } from '@/lib/errors';
import { LocationError, openLocationSettings } from '@/services/location';
import { hasBackgroundPermission, requestBackgroundPermission } from '@/services/partner-tracking';

export default function PartnerHome() {
  const { t } = useTranslation();
  const partner = usePartner();
  const setOnline = useSetOnline();
  const [explainBackground, setExplainBackground] = useState(false);
  const [backgroundDenied, setBackgroundDenied] = useState(false);

  // After a restart, make the OS tracking task match the server's online flag.
  useEffect(() => {
    if (partner.data?.status === 'approved') void reconcileTracking(partner.data.is_online);
  }, [partner.data?.status, partner.data?.is_online]);

  if (partner.isPending) return <LoadingState />;
  if (partner.isError) return <ErrorState error={partner.error} onRetry={() => void partner.refetch()} />;
  if (!partner.data) return <Redirect href="/partner/register" />;

  const p = partner.data;
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

  const onlineError = setOnline.error;
  const locationProblem = onlineError instanceof LocationError ? onlineError.reason : null;

  return (
    <Screen
      refreshing={partner.isRefetching}
      onRefresh={() => void partner.refetch()}
      footer={<Button label={t('profile.title')} variant="secondary" icon="settings-outline" onPress={() => router.push('/partner/settings')} />}
    >
      <AppText variant="heading" weight="bold" accessibilityRole="header">
        {t(`vehicles.${p.vehicle_type}`)}
        {p.vehicle_registration ? ` · ${p.vehicle_registration}` : ''}
      </AppText>

      {p.status !== 'approved' ? (
        <>
          <VerificationStatus
            status={p.status}
            reason={p.status_reason}
            pendingBody={t('partner.pending_body')}
            titles={{ pending: t('partner.pending_title'), rejected: t('vendor.rejected_title'), suspended: t('vendor.suspended_title') }}
          />
          {p.status === 'rejected' && <Button label={t('vendor.edit_and_resubmit')} onPress={() => router.push('/partner/register')} />}
        </>
      ) : (
        <>
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
              onPress={() => (p.is_online ? setOnline.mutate(false) : void goOnline())}
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
          <Banner tone="info" message={t('common.coming_next')} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  status: { gap: spacing.md },
  statusOnline: { borderColor: colors.status.success, borderWidth: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 14, height: 14, borderRadius: radii.pill },
  flex: { flex: 1 },
});
