import { Ionicons } from '@expo/vector-icons';
import { colors, formatDistance, radii, spacing } from '@localloop/shared';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackRow } from '@/components/BackRow';
import { Price } from '@/components/shop/Price';
import { AppText, EmptyState, ErrorState, LoadingState, fontFor } from '@/components/ui';
import { publicImageUrl, useProductSearch } from '@/features/discovery/api';
import { useSelectedLocation } from '@/stores/location';

/** Search products across every shop within 10 km, nearest first. */
export default function SearchScreen() {
  const { t, i18n } = useTranslation();
  const te = i18n.language === 'te';
  const location = useSelectedLocation((s) => s.selected);
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  // Wait for a pause in typing before searching.
  useEffect(() => {
    const id = setTimeout(() => setQuery(text), 350);
    return () => clearTimeout(id);
  }, [text]);
  const results = useProductSearch(location, query);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <BackRow title={t('search.title')} />
        <View style={styles.inputWrap}>
          <Ionicons name="search" size={22} color={colors.text.secondary} />
          <TextInput
            autoFocus
            value={text}
            onChangeText={setText}
            placeholder={t('search.placeholder')}
            placeholderTextColor={colors.text.muted}
            accessibilityLabel={t('search.placeholder')}
            returnKeyType="search"
            style={[styles.input, { fontFamily: fontFor(text || t('search.placeholder'), 'regular') }]}
          />
          {!!text && (
            <Pressable accessibilityRole="button" accessibilityLabel={t('search.clear')} onPress={() => setText('')} hitSlop={8}>
              <Ionicons name="close-circle" size={22} color={colors.text.muted} />
            </Pressable>
          )}
        </View>
      </View>
      {query.trim().length < 2 ? (
        <EmptyState icon="search-outline" message={t('search.hint')} />
      ) : results.isPending ? (
        <LoadingState />
      ) : results.isError ? (
        <ErrorState error={results.error} onRetry={() => void results.refetch()} />
      ) : (
        <FlatList
          data={results.data}
          keyExtractor={(r) => `${r.product_id}-${r.variant_id}`}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<EmptyState icon="basket-outline" message={t('search.none', { query: query.trim() })} />}
          renderItem={({ item }) => {
            const d = formatDistance(item.distance_m);
            const img = publicImageUrl('product-media', item.image_path);
            return (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/product/[id]', params: { id: item.product_id } })}
                style={({ pressed }) => [styles.item, pressed && styles.pressed]}
              >
                {img ? (
                  <Image source={{ uri: img }} style={styles.thumb} accessibilityIgnoresInvertColors />
                ) : (
                  <View style={[styles.thumb, styles.thumbEmpty]}>
                    <Ionicons name="cube-outline" size={26} color={colors.text.muted} />
                  </View>
                )}
                <View style={styles.flex}>
                  <AppText weight="bold" numberOfLines={2}>
                    {te && item.product_name_te ? item.product_name_te : item.product_name}
                  </AppText>
                  <AppText variant="small" color={colors.text.secondary} numberOfLines={1}>
                    {item.store_name} · {d.value} {t(`common.${d.unit}`)}
                    {!item.store_is_open ? ` · ${t('search.closed')}` : ''}
                  </AppText>
                  <AppText variant="small" color={colors.text.secondary}>
                    {item.variant_label}
                  </AppText>
                  <Price price={Number(item.price)} salePrice={item.sale_price == null ? null : Number(item.sale_price)} />
                  {!item.in_stock && (
                    <AppText variant="small" weight="bold" color={colors.status.danger}>
                      {t('search.out_of_stock')}
                    </AppText>
                  )}
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.background },
  header: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.sm },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.surface.borderStrong,
    backgroundColor: colors.surface.card,
  },
  input: { flex: 1, fontSize: 17, color: colors.text.primary, paddingVertical: spacing.sm },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.sm, flexGrow: 1 },
  item: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.surface.card },
  pressed: { opacity: 0.7 },
  thumb: { width: 72, height: 72, borderRadius: radii.sm },
  thumbEmpty: { backgroundColor: colors.surface.background, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, gap: 2 },
});
