import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@localloop/shared';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { AppText, Card, ErrorState, LoadingState, Screen } from '@/components/ui';
import { useCategories } from '@/features/discovery/api';

/** Shop types filter the nearby list on Home. Product browsing by category arrives with search (Phase 2). */
export default function Categories() {
  const { t, i18n } = useTranslation();
  const te = i18n.language === 'te';
  const stores = useCategories('store');

  return (
    <Screen refreshing={stores.isRefetching} onRefresh={() => void stores.refetch()}>
      <AppText variant="heading" weight="bold" accessibilityRole="header">
        {t('categories.title')}
      </AppText>
      <AppText variant="title" weight="medium">
        {t('categories.shops')}
      </AppText>
      {stores.isPending ? (
        <LoadingState />
      ) : stores.isError ? (
        <ErrorState error={stores.error} onRetry={() => void stores.refetch()} />
      ) : (
        <View style={styles.grid}>
          {stores.data.map((c) => (
            <Card
              key={c.id}
              style={styles.tile}
              accessibilityLabel={te ? c.name_te : c.name_en}
              onPress={() => router.navigate({ pathname: '/home', params: { category: c.id } })}
            >
              <Ionicons name="storefront-outline" size={28} color={colors.brand.forest} accessibilityElementsHidden />
              <AppText weight="medium">{te ? c.name_te : c.name_en}</AppText>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: { width: '47%', minHeight: 104, justifyContent: 'center' },
});
