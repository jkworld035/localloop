import { colors, spacing } from '@localloop/shared';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { AppText, Card, EmptyState, ErrorState, LoadingState, Screen } from '@/components/ui';
import { useWishlist } from '@/features/orders/api';

export default function Wishlist() {
  const { t, i18n } = useTranslation();
  const te = i18n.language === 'te';
  const items = useWishlist();

  return (
    <Screen refreshing={items.isRefetching} onRefresh={() => void items.refetch()}>
      <AppText variant="heading" weight="bold" accessibilityRole="header">
        {t('wishlist.title')}
      </AppText>
      {items.isPending ? (
        <LoadingState />
      ) : items.isError ? (
        <ErrorState error={items.error} onRetry={() => void items.refetch()} />
      ) : items.data.length === 0 ? (
        <EmptyState icon="heart-outline" message={t('wishlist.empty')} />
      ) : (
        <View style={styles.list}>
          {items.data.map((w) => (
            <Card key={w.id}>
              <AppText weight="bold">
                {w.product ? (te && w.product.name_te) || w.product.name : (te && w.store?.name_te) || w.store?.name}
              </AppText>
              {w.store && (
                <AppText variant="small" color={colors.text.secondary}>
                  {w.store.locality}
                </AppText>
              )}
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({ list: { gap: spacing.md } });
