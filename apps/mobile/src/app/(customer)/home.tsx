import { Ionicons } from '@expo/vector-icons';
import { colors, DEFAULT_SEARCH_RADIUS_KM, radii, SEARCH_RADII_KM, spacing } from '@localloop/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText, Banner, Chip, EmptyState, ErrorState, LoadingState, Screen } from '@/components/ui';
import { useAreaStatus, useCategories, useNearbyStores, type StoreSort } from '@/features/discovery/api';
import { StoreCard } from '@/features/discovery/StoreCard';
import { useSelectedLocation } from '@/stores/location';

export default function Home() {
  const { t, i18n } = useTranslation();
  const te = i18n.language === 'te';
  const params = useLocalSearchParams<{ category?: string }>();
  const location = useSelectedLocation((s) => s.selected);
  const [radiusKm, setRadiusKm] = useState<number>(DEFAULT_SEARCH_RADIUS_KM);
  const [sort, setSort] = useState<StoreSort>('distance');
  const [openNow, setOpenNow] = useState(false);
  const categoryId = params.category ?? null;
  const categories = useCategories('store');
  const activeCategory = categories.data?.find((c) => c.id === categoryId);

  const stores = useNearbyStores(
    location ? { latitude: location.latitude, longitude: location.longitude, radiusKm, sort, openNow, categoryId } : null,
  );
  const area = useAreaStatus(location);
  const nextRadius = SEARCH_RADII_KM.find((r) => r > radiusKm);

  return (
    <Screen refreshing={stores.isRefetching} onRefresh={() => void stores.refetch()}>
      {/* Location header */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('home.deliver_to')}: ${location?.label ?? t('location.current')}. ${t('location.change')}`}
        onPress={() => router.push('/location')}
        style={styles.locationRow}
      >
        <Ionicons name="location" size={26} color={colors.brand.forest} />
        <View style={styles.flex}>
          <AppText variant="caption" color={colors.text.secondary}>
            {t('home.deliver_to')}
          </AppText>
          <View style={styles.inline}>
            <AppText variant="bodyLarge" weight="bold" numberOfLines={1} style={styles.flexShrink}>
              {location?.label ?? t('location.current')}
            </AppText>
            <Ionicons name="chevron-down" size={18} color={colors.text.primary} />
          </View>
        </View>
      </Pressable>

      {area.data && !area.data.serviceable && <Banner tone="info" message={t('location.not_serviceable')} />}

      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {SEARCH_RADII_KM.map((r) => (
          <Chip key={r} label={t('home.radius', { km: r })} selected={radiusKm === r} onPress={() => setRadiusKm(r)} />
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label={t('home.filters.nearest')} selected={sort === 'distance'} onPress={() => setSort('distance')} />
        <Chip label={t('home.filters.rating')} selected={sort === 'rating'} onPress={() => setSort('rating')} />
        <Chip label={t('home.filters.fastest')} selected={sort === 'fastest'} onPress={() => setSort('fastest')} />
        <Chip label={t('home.filters.open_now')} selected={openNow} onPress={() => setOpenNow((v) => !v)} />
        {activeCategory && (
          <Chip
            label={`${te ? activeCategory.name_te : activeCategory.name_en}  ✕`}
            selected
            onPress={() => router.setParams({ category: undefined })}
          />
        )}
      </ScrollView>

      <AppText variant="title" weight="bold" accessibilityRole="header">
        {t('home.nearby_stores')}
      </AppText>

      {stores.isPending ? (
        <LoadingState />
      ) : stores.isError ? (
        <ErrorState error={stores.error} onRetry={() => void stores.refetch()} />
      ) : stores.data.length === 0 ? (
        <EmptyState
          message={t('home.no_stores', { km: radiusKm })}
          actionLabel={nextRadius ? t('home.widen_radius') : undefined}
          onAction={nextRadius ? () => setRadiusKm(nextRadius) : undefined}
        />
      ) : (
        <View style={styles.list}>
          {stores.data.map((s) => (
            <StoreCard key={s.id} store={s} />
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 56,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surface.card,
  },
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  chips: { gap: spacing.sm, paddingRight: spacing.lg },
  list: { gap: spacing.md },
});
