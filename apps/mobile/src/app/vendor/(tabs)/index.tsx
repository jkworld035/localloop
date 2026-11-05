import { Ionicons } from '@expo/vector-icons';
import { colors, formatINR, spacing } from '@localloop/shared';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { AppText, Banner, Button, Card, ErrorState, Screen } from '@/components/ui';
import { useProfile } from '@/features/account/api';
import { AcceptingSwitch } from '@/features/vendor/AcceptingSwitch';
import { useMyStore, useVendor, useVendorDashboard, useVendorDocuments } from '@/features/vendor/api';

export default function VendorHome() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'te' ? 'te' : 'en';
  const profile = useProfile();
  const vendor = useVendor();
  const store = useMyStore();
  const docs = useVendorDocuments();
  const approved = vendor.data?.status === 'approved' && store.data?.status === 'approved';
  const dash = useVendorDashboard(approved ? store.data?.id : undefined);
  const v = vendor.data;
  if (!v) return null;

  const refresh = () => {
    void vendor.refetch();
    void store.refetch();
    void docs.refetch();
    void dash.refetch();
  };

  return (
    <Screen refreshing={vendor.isRefetching || dash.isRefetching} onRefresh={refresh}>
      <AppText variant="caption" color={colors.text.secondary}>
        {profile.data?.full_name}
      </AppText>
      <AppText variant="heading" weight="bold" accessibilityRole="header">
        {store.data?.name ?? v.business_name}
      </AppText>

      {v.status === 'rejected' && (
        <Banner tone="danger" title={t('vendor.rejected_title')} message={v.status_reason ?? ''} actionLabel={t('vendor.edit_and_resubmit')} onAction={() => router.push('/vendor/register')} />
      )}
      {v.status === 'suspended' && <Banner tone="danger" title={t('vendor.suspended_title')} message={v.status_reason ?? ''} />}
      {store.data && store.data.status !== 'approved' && store.data.status_reason && (
        <Banner tone="warning" title={t('vendor.shop_needs_changes')} message={store.data.status_reason} actionLabel={t('vendor.edit_shop')} onAction={() => router.push('/vendor/store-edit')} />
      )}

      {!approved ? (
        <Card>
          <AppText variant="title" weight="bold">
            {t('vendor.setup_title')}
          </AppText>
          <AppText color={colors.text.secondary}>{t('vendor.setup_body')}</AppText>
          <Step done label={t('vendor.step_business')} />
          <Step done={!!store.data} label={t('vendor.step_shop')} actionLabel={store.data ? undefined : t('vendor.set_up_shop')} onAction={() => router.push('/vendor/store-edit')} />
          <Step done={(docs.data?.length ?? 0) > 0} label={t('vendor.step_documents')} actionLabel={(docs.data?.length ?? 0) > 0 ? undefined : t('vendor.upload_documents')} onAction={() => router.push('/vendor/documents')} />
          <Step done={false} pending label={t('vendor.step_review')} />
        </Card>
      ) : (
        <>
          {store.data && <AcceptingSwitch store={store.data} />}
          {dash.isError ? (
            <ErrorState error={dash.error} onRetry={() => void dash.refetch()} />
          ) : (
            <>
              {(dash.data?.new_orders ?? 0) > 0 && (
                <Button
                  label={t('vendor.new_orders_waiting', { count: dash.data!.new_orders })}
                  icon="notifications"
                  onPress={() => router.navigate('/vendor/orders')}
                />
              )}
              <View style={styles.grid}>
                <Tile label={t('vendor.in_progress')} value={dash.data?.in_progress} />
                <Tile label={t('vendor.ready_for_pickup')} value={dash.data?.ready} />
                <Tile label={t('vendor.orders_today')} value={dash.data?.orders_today} />
                <Tile label={t('vendor.completed_today')} value={dash.data?.delivered_today} />
                <Tile label={t('vendor.sales_today')} value={dash.data ? formatINR(dash.data.sales_today, lang) : undefined} />
                <Tile label={t('vendor.sales_7d')} value={dash.data ? formatINR(dash.data.sales_7d, lang) : undefined} />
              </View>
              {dash.data && dash.data.payout_pending > 0 && (
                <Card>
                  <AppText variant="small" color={colors.text.secondary}>
                    {t('vendor.payout_pending')}
                  </AppText>
                  <AppText variant="heading" weight="bold" color={colors.brand.forest}>
                    {formatINR(dash.data.payout_pending, lang)}
                  </AppText>
                </Card>
              )}
              {(dash.data?.low_stock ?? 0) > 0 && (
                <Banner
                  tone="warning"
                  message={t('vendor.low_stock_alert', { count: dash.data!.low_stock })}
                  actionLabel={t('vendor.tabs.products')}
                  onAction={() => router.navigate('/vendor/products')}
                />
              )}
              {!!dash.data?.top_products_7d.length && (
                <Card>
                  <AppText variant="title" weight="bold">
                    {t('vendor.top_products')}
                  </AppText>
                  {dash.data.top_products_7d.map((p) => (
                    <View key={p.name} style={styles.rowBetween}>
                      <AppText style={styles.flex}>{p.name}</AppText>
                      <AppText weight="bold">{p.quantity}</AppText>
                    </View>
                  ))}
                </Card>
              )}
            </>
          )}
        </>
      )}
    </Screen>
  );
}

function Tile({ label, value }: { label: string; value: string | number | undefined }) {
  return (
    <Card style={styles.tile}>
      <AppText variant="heading" weight="bold" color={colors.brand.forest}>
        {value ?? '–'}
      </AppText>
      <AppText variant="small" color={colors.text.secondary}>
        {label}
      </AppText>
    </Card>
  );
}

function Step({ done, pending, label, actionLabel, onAction }: { done: boolean; pending?: boolean; label: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={styles.step}>
      <Ionicons
        name={done ? 'checkmark-circle' : pending ? 'time-outline' : 'ellipse-outline'}
        size={24}
        color={done ? colors.status.success : colors.text.muted}
      />
      <AppText style={styles.flex} weight={done ? 'regular' : 'medium'}>
        {label}
      </AppText>
      {actionLabel && onAction && <Button label={actionLabel} compact variant="secondary" onPress={onAction} />}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: { width: '47%' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  flex: { flex: 1 },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48 },
});
