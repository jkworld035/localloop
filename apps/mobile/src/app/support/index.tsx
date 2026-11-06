import { colors, spacing } from '@localloop/shared';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackRow } from '@/components/BackRow';
import { AppText, Button, Card, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { useMyTickets } from '@/features/support/api';

export default function SupportList() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'te' ? 'te-IN' : 'en-IN';
  const tickets = useMyTickets();

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <BackRow title={t('support.title')} />
        <AppText color={colors.text.secondary}>{t('support.intro')}</AppText>
        <Button label={t('support.new')} icon="add" onPress={() => router.push('/support/new')} />
      </View>
      {tickets.isPending ? (
        <LoadingState />
      ) : tickets.isError ? (
        <ErrorState error={tickets.error} onRetry={() => void tickets.refetch()} />
      ) : (
        <FlatList
          data={tickets.data}
          keyExtractor={(x) => x.id}
          contentContainerStyle={styles.list}
          refreshing={tickets.isRefetching}
          onRefresh={() => void tickets.refetch()}
          ListEmptyComponent={<EmptyState icon="chatbubbles-outline" message={t('support.empty')} />}
          renderItem={({ item }) => (
            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/support/[id]', params: { id: item.id } })}>
              <Card>
                <View style={styles.row}>
                  <AppText weight="bold" style={styles.flex}>
                    {item.subject}
                  </AppText>
                  <AppText variant="small" weight="bold" color={item.status === 'resolved' || item.status === 'closed' ? colors.status.success : colors.status.warning}>
                    {t(`support.status.${item.status}`)}
                  </AppText>
                </View>
                <AppText variant="small" color={colors.text.secondary}>
                  {t(`support.categories.${item.category}`)}
                  {item.order ? ` · ${item.order.order_number}` : ''} ·{' '}
                  {new Date(item.updated_at).toLocaleDateString(lang, { timeZone: 'Asia/Kolkata', dateStyle: 'medium' })}
                </AppText>
              </Card>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.background },
  header: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing.md },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md, flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
