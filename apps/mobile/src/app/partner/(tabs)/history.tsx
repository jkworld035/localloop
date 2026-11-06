import { colors, formatINR, spacing } from '@localloop/shared';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Card, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { usePartnerDashboard, usePartnerHistory } from '@/features/partner/api';

/** Completed deliveries with the earning recorded for each. */
export default function PartnerHistory() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'te' ? 'te' : 'en';
  const history = usePartnerHistory();
  const dash = usePartnerDashboard(true);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <AppText variant="heading" weight="bold" accessibilityRole="header">
          {t('partner.history')}
        </AppText>
        {dash.data && (
          <AppText color={colors.text.secondary}>
            {t('partner.week_summary', { count: dash.data.deliveries_7d, amount: formatINR(Number(dash.data.earnings_7d), lang) })}
          </AppText>
        )}
      </View>
      {history.isPending ? (
        <LoadingState />
      ) : history.isError ? (
        <ErrorState error={history.error} onRetry={() => void history.refetch()} />
      ) : (
        <FlatList
          data={history.data}
          keyExtractor={(a) => a.id}
          contentContainerStyle={styles.list}
          refreshing={history.isRefetching}
          onRefresh={() => void history.refetch()}
          ListEmptyComponent={<EmptyState icon="bicycle-outline" message={t('partner.no_history')} />}
          renderItem={({ item }) => {
            const addr = (item.order?.delivery_address ?? {}) as Record<string, string>;
            return (
              <Card>
                <View style={styles.row}>
                  <View style={styles.flex}>
                    <AppText weight="bold">{item.order?.store?.name}</AppText>
                    <AppText variant="small" color={colors.text.secondary}>
                      {item.order?.order_number} · {[addr.locality, addr.city].filter(Boolean).join(', ')}
                    </AppText>
                    {item.delivered_at && (
                      <AppText variant="small" color={colors.text.secondary}>
                        {new Date(item.delivered_at).toLocaleString(lang === 'te' ? 'te-IN' : 'en-IN', {
                          timeZone: 'Asia/Kolkata',
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </AppText>
                    )}
                  </View>
                  <View style={styles.end}>
                    <AppText variant="title" weight="bold" color={colors.status.success}>
                      {formatINR(Number(item.earning ?? 0), lang)}
                    </AppText>
                    {item.order?.payment_method === 'cod' && (
                      <AppText variant="caption" color={colors.text.secondary}>
                        {t('partner.cash_collected', { amount: formatINR(Number(item.order.total), lang) })}
                      </AppText>
                    )}
                  </View>
                </View>
              </Card>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.background },
  header: { padding: spacing.lg, gap: spacing.xs },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md, flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  end: { alignItems: 'flex-end' },
});
