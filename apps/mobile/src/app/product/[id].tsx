import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing } from '@localloop/shared';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackRow } from '@/components/BackRow';
import { CartBar } from '@/components/shop/CartBar';
import { Price } from '@/components/shop/Price';
import { QuantityStepper } from '@/components/shop/QuantityStepper';
import { SaveButton } from '@/components/shop/SaveButton';
import { AppText, Banner, ErrorState, LoadingState } from '@/components/ui';
import { isPurchasable, sellableVariants, stockOf, useProduct, useStoreSummary } from '@/features/catalog/api';
import { useCartQuantities } from '@/features/cart/api';
import { useAddToCart } from '@/features/cart/useAddToCart';
import { publicImageUrl } from '@/features/discovery/api';
import { useSelectedLocation } from '@/stores/location';

export default function ProductPage() {
  const { t, i18n } = useTranslation();
  const te = i18n.language === 'te';
  const { id } = useLocalSearchParams<{ id: string }>();
  const product = useProduct(id);
  const location = useSelectedLocation((s) => s.selected);
  const storeId = product.data?.store_id ?? '';
  const summary = useStoreSummary(storeId, location);
  const quantities = useCartQuantities(storeId);
  const { change, pendingVariantId } = useAddToCart();
  const [selected, setSelected] = useState<string | null>(null);
  const [imageIndex, setImageIndex] = useState(0);

  if (product.isPending) return <LoadingState />;
  if (product.isError)
    return (
      <SafeAreaView style={styles.root}>
        <BackRow />
        <ErrorState error={product.error} onRetry={() => void product.refetch()} />
      </SafeAreaView>
    );

  const p = product.data;
  const name = (te && p.name_te) || p.name;
  const description = (te && p.description_te) || p.description;
  const highlights = te && p.highlights_te.length ? p.highlights_te : p.highlights;
  const variants = sellableVariants(p);
  const variant = variants.find((v) => v.id === selected) ?? variants[0];
  const images = [...p.images].sort((a, b) => a.sort_order - b.sort_order);
  const image = publicImageUrl('product-media', images[imageIndex]?.storage_path);
  const s = summary.data;
  const orderingOpen = !!s && s.is_open && s.is_accepting_orders && s.delivers_here !== false;
  const stock = variant ? stockOf(variant) : null;
  const storeName = (te && p.store?.name_te) || p.store?.name || '';

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <BackRow />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.imageWrap}>
          {image ? (
            <Image source={{ uri: image }} style={styles.image} contentFit="contain" accessibilityLabel={name} />
          ) : (
            <View style={[styles.image, styles.placeholder]}>
              <Ionicons name="cube-outline" size={64} color={colors.text.muted} />
            </View>
          )}
        </View>
        {images.length > 1 && (
          <View style={styles.dots}>
            {images.map((img, i) => (
              <Pressable
                key={img.storage_path}
                accessibilityRole="button"
                accessibilityLabel={t('shop.photo', { index: i + 1, total: images.length })}
                accessibilityState={{ selected: i === imageIndex }}
                onPress={() => setImageIndex(i)}
                hitSlop={10}
                style={[styles.dot, i === imageIndex && styles.dotActive]}
              />
            ))}
          </View>
        )}

        <View style={styles.titleRow}>
          <AppText variant="heading" weight="bold" style={styles.flex} accessibilityRole="header">
            {name}
          </AppText>
          <SaveButton productId={p.id} name={name} />
        </View>
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push({ pathname: '/store/[id]', params: { id: p.store_id } })}
          style={styles.storeLink}
        >
          <Ionicons name="storefront-outline" size={18} color={colors.brand.forest} />
          <AppText weight="medium" color={colors.brand.forest}>
            {storeName}
          </AppText>
        </Pressable>

        {variant ? (
          <>
            <Price price={variant.price} salePrice={variant.sale_price} large />
            {variants.length > 1 && (
              <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel={t('shop.choose_size')}>
                <AppText weight="medium">{t('shop.choose_size')}</AppText>
                <View style={styles.variants}>
                  {variants.map((v) => {
                    const on = v.id === variant.id;
                    const inCart = quantities.get(v.id) ?? 0;
                    return (
                      <Pressable
                        key={v.id}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: on, disabled: !isPurchasable(p, v) }}
                        onPress={() => setSelected(v.id)}
                        style={[styles.variant, on && styles.variantOn, !isPurchasable(p, v) && styles.variantOut]}
                      >
                        <AppText weight={on ? 'bold' : 'regular'}>{v.label}</AppText>
                        <AppText variant="small" color={colors.text.secondary}>
                          ₹{v.sale_price ?? v.price}
                          {inCart ? ` · ${t('shop.in_cart', { count: inCart })}` : ''}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
            {!isPurchasable(p, variant) ? (
              <Banner tone="danger" message={t('shop.out_of_stock')} />
            ) : (
              stock !== null && stock <= 5 && <Banner tone="warning" message={t('shop.only_left', { count: stock })} />
            )}
            {s && !orderingOpen && (
              <Banner
                tone="info"
                message={!s.is_open ? t('shop.closed_now') : !s.is_accepting_orders ? t('shop.paused') : t('shop.not_delivering')}
              />
            )}
            <View style={styles.stepperRow}>
              <QuantityStepper
                itemName={`${name} ${variant.label}`}
                quantity={quantities.get(variant.id) ?? 0}
                max={stock}
                busy={pendingVariantId === variant.id}
                disabled={!isPurchasable(p, variant) || !orderingOpen}
                onChange={(q) => change(p.store_id, variant.id, q)}
              />
            </View>
          </>
        ) : (
          <Banner tone="danger" message={t('shop.out_of_stock')} />
        )}

        {highlights.length > 0 && (
          <View style={styles.group}>
            <AppText variant="title" weight="bold">
              {t('shop.benefits')}
            </AppText>
            {highlights.map((h, i) => (
              <View key={i} style={styles.benefit}>
                <Ionicons name="checkmark-circle" size={20} color={colors.brand.green} />
                <AppText style={styles.flex}>{h}</AppText>
              </View>
            ))}
          </View>
        )}

        {!!description && (
          <View style={styles.group}>
            <AppText variant="title" weight="bold">
              {t('shop.description')}
            </AppText>
            <AppText>{description}</AppText>
          </View>
        )}
      </ScrollView>
      <CartBar />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  benefit: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  root: { flex: 1, backgroundColor: colors.surface.background },
  body: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  imageWrap: { borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.surface.card },
  image: { width: '100%', aspectRatio: 1 },
  placeholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface.sunken },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: radii.pill, backgroundColor: colors.surface.borderStrong },
  dotActive: { backgroundColor: colors.brand.forest },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  flex: { flex: 1 },
  storeLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 44 },
  group: { gap: spacing.sm },
  variants: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  variant: {
    minWidth: 96,
    minHeight: 56,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.surface.borderStrong,
    backgroundColor: colors.surface.card,
    padding: spacing.sm,
    justifyContent: 'center',
  },
  variantOn: { borderColor: colors.brand.forest, borderWidth: 2 },
  variantOut: { opacity: 0.5 },
  stepperRow: { alignItems: 'flex-start' },
});
