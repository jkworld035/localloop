import { Ionicons } from '@expo/vector-icons';
import { colors, formatDistance, radii, spacing } from '@localloop/shared';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, SectionList, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackRow } from '@/components/BackRow';
import { CartBar } from '@/components/shop/CartBar';
import { ProductRow } from '@/components/shop/ProductRow';
import { SaveButton } from '@/components/shop/SaveButton';
import { AppText, Banner, Chip, EmptyState, ErrorState, LoadingState, fontFor } from '@/components/ui';
import { sellableVariants, useStoreProducts, useStoreSummary, type CatalogProduct } from '@/features/catalog/api';
import { useCartQuantities } from '@/features/cart/api';
import { useAddToCart } from '@/features/cart/useAddToCart';
import { publicImageUrl } from '@/features/discovery/api';
import { StoreReviews } from '@/features/reviews/StoreReviews';
import { useSelectedLocation } from '@/stores/location';

export default function StorePage() {
  const { t, i18n } = useTranslation();
  const te = i18n.language === 'te';
  const { id } = useLocalSearchParams<{ id: string }>();
  const location = useSelectedLocation((s) => s.selected);
  const summary = useStoreSummary(id, location);
  const products = useStoreProducts(id);
  const quantities = useCartQuantities(id);
  const { change, pendingVariantId } = useAddToCart();
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (products.data ?? []).filter(
      (p) =>
        sellableVariants(p).length > 0 &&
        (!categoryId || p.category_id === categoryId) &&
        (!q || p.name.toLowerCase().includes(q) || p.name_te.includes(query.trim())),
    );
    const groups = new Map<string, { title: string; order: number; data: CatalogProduct[] }>();
    for (const p of list) {
      const key = p.category?.id ?? 'other';
      const g = groups.get(key) ?? {
        title: p.category ? (te ? p.category.name_te : p.category.name_en) : '',
        order: p.category?.sort_order ?? 999,
        data: [],
      };
      g.data.push(p);
      groups.set(key, g);
    }
    return [...groups.values()].sort((a, b) => a.order - b.order);
  }, [products.data, query, categoryId, te]);

  const categories = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; order: number }>();
    for (const p of products.data ?? []) {
      if (p.category && !seen.has(p.category.id)) {
        seen.set(p.category.id, { id: p.category.id, name: te ? p.category.name_te : p.category.name_en, order: p.category.sort_order });
      }
    }
    return [...seen.values()].sort((a, b) => a.order - b.order);
  }, [products.data, te]);

  if (summary.isPending) return <LoadingState />;
  if (summary.isError)
    return (
      <SafeAreaView style={styles.root}>
        <BackRow />
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      </SafeAreaView>
    );

  const s = summary.data;
  const name = (te && s.name_te) || s.name;
  const orderingOpen = s.is_open && s.is_accepting_orders && s.delivers_here !== false;
  const cover = publicImageUrl('store-media', s.cover_path ?? s.logo_path);
  const dist = s.distance_m != null ? formatDistance(s.distance_m) : null;
  const hours = s.today_hours.map((h) => `${h.open}–${h.close}`).join(', ');

  const header = (
    <View style={styles.header}>
      {cover && <Image source={{ uri: cover }} style={styles.cover} contentFit="cover" accessibilityIgnoresInvertColors />}
      <View style={styles.titleRow}>
        <View style={styles.flex}>
          <AppText variant="heading" weight="bold" accessibilityRole="header">
            {name}
          </AppText>
          <AppText color={colors.text.secondary}>
            {s.category ? (te ? s.category.name_te : s.category.name_en) : ''} · {s.locality}
          </AppText>
        </View>
        <SaveButton storeId={s.id} name={name} />
      </View>
      <View style={styles.meta}>
        <AppText variant="small" weight="bold" color={s.is_open ? colors.status.success : colors.status.danger}>
          {s.is_open ? t('common.open') : t('common.closed')}
        </AppText>
        <AppText variant="small" color={colors.text.secondary}>
          {hours ? t('shop.hours_today', { hours }) : t('shop.closed_today')}
        </AppText>
        {dist && (
          <AppText variant="small" color={colors.text.secondary}>
            {dist.value} {t(`common.${dist.unit}`)}
          </AppText>
        )}
        {s.rating_count > 0 && (
          <View style={styles.inline}>
            <Ionicons name="star" size={14} color={colors.brand.amber} />
            <AppText variant="small">{t('home.ratings', { rating: Number(s.rating_avg).toFixed(1), count: s.rating_count })}</AppText>
          </View>
        )}
        {s.est_minutes_min != null && s.delivers_here && (
          <AppText variant="small" color={colors.text.secondary}>
            {t('home.eta_range', { min: s.est_minutes_min, max: s.est_minutes_max })} ({t('common.approx')})
          </AppText>
        )}
        {s.min_order_value > 0 && (
          <AppText variant="small" color={colors.text.secondary}>
            {t('home.min_order', { amount: s.min_order_value })}
          </AppText>
        )}
      </View>
      {!s.is_open && <Banner tone="warning" message={t('shop.closed_now')} />}
      {s.is_open && !s.is_accepting_orders && <Banner tone="warning" message={t('shop.paused')} />}
      {s.delivers_here === false && <Banner tone="info" message={t('shop.not_delivering')} />}
      {!!s.description && <AppText color={colors.text.secondary}>{s.description}</AppText>}

      <View style={styles.search}>
        <Ionicons name="search" size={20} color={colors.text.secondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('shop.search_in_store')}
          placeholderTextColor={colors.text.muted}
          accessibilityLabel={t('shop.search_in_store')}
          style={[styles.searchInput, { fontFamily: fontFor(query, 'regular') }]}
          returnKeyType="search"
        />
      </View>
      {categories.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label={t('shop.all')} selected={!categoryId} onPress={() => setCategoryId(null)} />
          {categories.map((c) => (
            <Chip key={c.id} label={c.name} selected={categoryId === c.id} onPress={() => setCategoryId(c.id)} />
          ))}
        </ScrollView>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <BackRow />
      <SectionList
        sections={sections}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={header}
        ListFooterComponent={<StoreReviews storeId={s.id} />}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        refreshing={products.isRefetching}
        onRefresh={() => {
          void products.refetch();
          void summary.refetch();
        }}
        renderSectionHeader={({ section }) =>
          section.title ? (
            <AppText variant="title" weight="bold" style={styles.sectionTitle} accessibilityRole="header">
              {section.title}
            </AppText>
          ) : null
        }
        renderItem={({ item }) => (
          <ProductRow
            product={item}
            storeId={s.id}
            quantities={quantities}
            pendingVariantId={pendingVariantId}
            orderingOpen={orderingOpen}
            onChange={(variantId, qty) => change(s.id, variantId, qty)}
          />
        )}
        ListEmptyComponent={
          products.isPending ? (
            <LoadingState />
          ) : products.isError ? (
            <ErrorState error={products.error} onRetry={() => void products.refetch()} />
          ) : (
            <EmptyState icon="cube-outline" message={query ? t('shop.no_match', { query }) : t('shop.no_products')} />
          )
        }
      />
      <CartBar />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.background },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
  header: { gap: spacing.md, paddingBottom: spacing.sm },
  cover: { height: 160, borderRadius: radii.lg, backgroundColor: colors.surface.sunken },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  flex: { flex: 1 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md, rowGap: spacing.xs },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 52,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surface.borderStrong,
    backgroundColor: colors.surface.card,
    paddingHorizontal: spacing.md,
  },
  searchInput: { flex: 1, fontSize: 16, color: colors.text.primary, paddingVertical: spacing.sm },
  chips: { gap: spacing.sm, paddingRight: spacing.lg },
  sectionTitle: { marginTop: spacing.lg, marginBottom: spacing.xs },
});
