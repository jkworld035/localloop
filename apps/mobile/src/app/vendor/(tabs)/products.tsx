import { Ionicons } from '@expo/vector-icons';
import { colors, formatINR, radii, spacing } from '@localloop/shared';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Button, EmptyState, ErrorState, LoadingState, fontFor } from '@/components/ui';
import { publicImageUrl } from '@/features/discovery/api';
import { useMyStore, useSetProductAvailability, useVendorProducts, type VendorProduct } from '@/features/vendor/api';
import { errorMessage } from '@/lib/errors';

export default function VendorProducts() {
  const { t, i18n } = useTranslation();
  const store = useMyStore();
  const products = useVendorProducts(store.data?.id);
  const availability = useSetProductAvailability(store.data?.id ?? '');
  const [query, setQuery] = useState('');
  const [lowOnly, setLowOnly] = useState(false);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (products.data ?? []).filter(
      (p) => (!q || p.name.toLowerCase().includes(q) || p.name_te.includes(query.trim())) && (!lowOnly || isLow(p)),
    );
  }, [products.data, query, lowOnly]);

  if (store.isPending) return <LoadingState />;
  if (!store.data) {
    return (
      <SafeAreaView style={styles.root}>
        <EmptyState icon="storefront-outline" message={t('vendor.no_shop')} actionLabel={t('vendor.set_up_shop')} onAction={() => router.push('/vendor/store-edit')} />
      </SafeAreaView>
    );
  }

  const lang = i18n.language === 'te' ? 'te' : 'en';
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <AppText variant="heading" weight="bold" accessibilityRole="header" style={styles.flex}>
          {t('vendor.tabs.products')}
        </AppText>
        <Button label={t('vendor.add_product')} icon="add" compact onPress={() => router.push('/vendor/product-edit')} />
      </View>
      <View style={styles.searchRow}>
        <View style={styles.search}>
          <Ionicons name="search" size={20} color={colors.text.secondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('vendor.search_products')}
            placeholderTextColor={colors.text.muted}
            accessibilityLabel={t('vendor.search_products')}
            style={[styles.searchInput, { fontFamily: fontFor(query, 'regular') }]}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: lowOnly }}
          onPress={() => setLowOnly((v) => !v)}
          style={[styles.lowToggle, lowOnly && styles.lowToggleOn]}
        >
          <AppText variant="small" weight="bold" color={lowOnly ? colors.text.onBrand : colors.status.warning}>
            {t('vendor.low_stock')}
          </AppText>
        </Pressable>
      </View>
      <FlatList
        data={list}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        refreshing={products.isRefetching}
        onRefresh={() => void products.refetch()}
        ListEmptyComponent={
          products.isPending ? (
            <LoadingState />
          ) : products.isError ? (
            <ErrorState error={products.error} onRetry={() => void products.refetch()} />
          ) : (
            <EmptyState icon="cube-outline" message={query || lowOnly ? t('shop.no_match', { query }) : t('vendor.no_products')} />
          )
        }
        renderItem={({ item: p }) => {
          const active = p.variants.filter((v) => v.is_active);
          const img = publicImageUrl('product-media', [...p.images].sort((a, b) => a.sort_order - b.sort_order)[0]?.storage_path);
          const name = (lang === 'te' && p.name_te) || p.name;
          return (
            <View style={styles.row}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${t('vendor.edit_product')}: ${name}`}
                onPress={() => router.push({ pathname: '/vendor/product-edit', params: { id: p.id } })}
                style={styles.main}
              >
                {img ? (
                  <Image source={{ uri: img }} style={styles.image} contentFit="cover" />
                ) : (
                  <View style={[styles.image, styles.placeholder]}>
                    <Ionicons name="camera-outline" size={22} color={colors.text.muted} />
                  </View>
                )}
                <View style={styles.flex}>
                  <AppText weight="bold" numberOfLines={2}>
                    {name}
                  </AppText>
                  {active.map((v) => {
                    const stock = v.inventory?.track_inventory ? v.inventory.quantity : null;
                    const low = stock !== null && stock <= (v.inventory?.low_stock_threshold ?? 0);
                    return (
                      <AppText key={v.id} variant="small" color={low ? colors.status.warning : colors.text.secondary}>
                        {v.label} · {formatINR(v.sale_price ?? v.price, lang)} · {stock === null ? t('vendor.stock_untracked') : t('vendor.stock_n', { count: stock })}
                      </AppText>
                    );
                  })}
                </View>
              </Pressable>
              <View style={styles.switch}>
                <Switch
                  accessibilityLabel={`${name}: ${p.is_available ? t('vendor.available') : t('shop.out_of_stock')}`}
                  value={p.is_available}
                  trackColor={{ true: colors.brand.green, false: colors.surface.borderStrong }}
                  onValueChange={(v) => availability.mutate({ id: p.id, available: v }, { onError: (e) => Alert.alert(errorMessage(e)) })}
                />
                <AppText variant="caption" color={p.is_available ? colors.status.success : colors.text.secondary}>
                  {p.is_available ? t('vendor.available') : t('vendor.hidden')}
                </AppText>
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

function isLow(p: VendorProduct) {
  return p.variants.some((v) => v.is_active && v.inventory?.track_inventory && v.inventory.quantity <= v.inventory.low_stock_threshold);
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, paddingBottom: spacing.sm },
  flex: { flex: 1, gap: spacing.xxs },
  searchRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surface.borderStrong,
    backgroundColor: colors.surface.card,
    paddingHorizontal: spacing.md,
  },
  searchInput: { flex: 1, fontSize: 16, color: colors.text.primary },
  lowToggle: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.brand.amber,
    justifyContent: 'center',
  },
  lowToggleOn: { backgroundColor: colors.status.warning, borderColor: colors.status.warning },
  list: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.surface.border,
  },
  main: { flex: 1, flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  image: { width: 56, height: 56, borderRadius: radii.md, backgroundColor: colors.surface.sunken },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  switch: { alignItems: 'center', minWidth: 64 },
});
