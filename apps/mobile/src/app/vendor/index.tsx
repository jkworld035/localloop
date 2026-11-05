import { colors, spacing } from '@localloop/shared';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { VerificationStatus } from '@/components/VerificationStatus';
import { AppText, Banner, Button, Card, ErrorState, LoadingState, Screen } from '@/components/ui';
import { useProfile } from '@/features/account/api';
import { useVendor, useVendorToday } from '@/features/vendor/api';

export default function VendorHome() {
  const { t } = useTranslation();
  const profile = useProfile();
  const vendor = useVendor();
  const today = useVendorToday();

  if (vendor.isPending) return <LoadingState />;
  if (vendor.isError) return <ErrorState error={vendor.error} onRetry={() => void vendor.refetch()} />;
  if (!vendor.data) return <Redirect href="/vendor/register" />;

  const v = vendor.data;
  return (
    <Screen
      refreshing={vendor.isRefetching || today.isRefetching}
      onRefresh={() => {
        void vendor.refetch();
        void today.refetch();
      }}
      footer={<Button label={t('profile.title')} variant="secondary" icon="settings-outline" onPress={() => router.push('/vendor/settings')} />}
    >
      <AppText variant="caption" color={colors.text.secondary}>
        {profile.data?.full_name}
      </AppText>
      <AppText variant="heading" weight="bold" accessibilityRole="header">
        {v.business_name}
      </AppText>

      {v.status === 'approved' ? (
        <>
          <AppText variant="title" weight="bold">
            {t('vendor.dashboard_title')}
          </AppText>
          {today.isError ? (
            <ErrorState error={today.error} onRetry={() => void today.refetch()} />
          ) : (
            <View style={styles.grid}>
              {(
                [
                  ['orders_today', today.data?.total],
                  ['pending_orders', today.data?.pending],
                  ['in_progress', today.data?.inProgress],
                  ['completed_today', today.data?.completed],
                ] as const
              ).map(([key, value]) => (
                <Card key={key} style={styles.tile}>
                  <AppText variant="display" weight="bold" color={colors.brand.forest}>
                    {value ?? '–'}
                  </AppText>
                  <AppText variant="small" color={colors.text.secondary}>
                    {t(`vendor.${key}`)}
                  </AppText>
                </Card>
              ))}
            </View>
          )}
          <Banner tone="info" message={t('common.coming_next')} />
        </>
      ) : (
        <>
          <VerificationStatus
            status={v.status}
            reason={v.status_reason}
            pendingBody={t('vendor.pending_body')}
            titles={{
              pending: t('vendor.pending_title'),
              rejected: t('vendor.rejected_title'),
              suspended: t('vendor.suspended_title'),
            }}
          />
          {v.status === 'rejected' && (
            <Button label={t('vendor.edit_and_resubmit')} onPress={() => router.push('/vendor/register')} />
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: { width: '47%' },
});
