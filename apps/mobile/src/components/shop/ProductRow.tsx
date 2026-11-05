import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing } from '@localloop/shared';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui';
import { isPurchasable, sellableVariants, stockOf, type CatalogProduct } from '@/features/catalog/api';
import { publicImageUrl } from '@/features/discovery/api';
import { Price } from './Price';
import { QuantityStepper } from './QuantityStepper';

/** One product in a shop list. Single-size products add straight from the list; multi-size ones open the product page. */
export function ProductRow({
  product,
  storeId,
  quantities,
  pendingVariantId,
  onChange,
  orderingOpen,
}: {
  product: CatalogProduct;
  storeId: string;
  quantities: Map<string, number>;
  pendingVariantId?: string;
  onChange: (variantId: string, qty: number) => void;
  orderingOpen: boolean;
}) {
  const { t, i18n } = useTranslation();
  const te = i18n.language === 'te';
  const name = (te && product.name_te) || product.name;
  const variants = sellableVariants(product);
  const first = variants[0];
  if (!first) return null;
  const image = publicImageUrl('product-media', [...product.images].sort((a, b) => a.sort_order - b.sort_order)[0]?.storage_path);
  const purchasable = isPurchasable(product, first);
  const stock = stockOf(first);
  const inCart = variants.reduce((n, v) => n + (quantities.get(v.id) ?? 0), 0);

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={name}
        accessibilityHint={t('shop.open_product')}
        onPress={() => router.push({ pathname: '/product/[id]', params: { id: product.id } })}
        style={styles.main}
      >
        {image ? (
          <Image source={{ uri: image }} style={styles.image} contentFit="cover" transition={120} />
        ) : (
          <View style={[styles.image, styles.placeholder]}>
            <Ionicons name="cube-outline" size={28} color={colors.text.muted} />
          </View>
        )}
        <View style={styles.text}>
          <AppText weight="bold" numberOfLines={2}>
            {name}
          </AppText>
          <AppText variant="small" color={colors.text.secondary}>
            {variants.length > 1 ? t('shop.sizes', { count: variants.length }) : first.label}
          </AppText>
          <Price price={first.price} salePrice={first.sale_price} />
          {!purchasable ? (
            <AppText variant="small" weight="bold" color={colors.status.danger}>
              {t('shop.out_of_stock')}
            </AppText>
          ) : (
            stock !== null &&
            stock <= 5 && (
              <AppText variant="small" color={colors.status.warning}>
                {t('shop.only_left', { count: stock })}
              </AppText>
            )
          )}
        </View>
      </Pressable>
      <View style={styles.action}>
        {variants.length > 1 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('shop.choose_size')}: ${name}`}
            onPress={() => router.push({ pathname: '/product/[id]', params: { id: product.id } })}
            style={styles.options}
          >
            <AppText weight="bold" color={colors.brand.forest}>
              {inCart > 0 ? t('shop.in_cart', { count: inCart }) : t('shop.options')}
            </AppText>
          </Pressable>
        ) : (
          <QuantityStepper
            itemName={name}
            quantity={quantities.get(first.id) ?? 0}
            max={stock}
            busy={pendingVariantId === first.id}
            disabled={!purchasable || !orderingOpen}
            onChange={(q) => onChange(first.id, q)}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.surface.border,
  },
  main: { flex: 1, flexDirection: 'row', gap: spacing.md },
  image: { width: 72, height: 72, borderRadius: radii.md, backgroundColor: colors.surface.sunken },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: spacing.xxs },
  action: { alignItems: 'flex-end' },
  options: {
    minWidth: 96,
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.brand.forest,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
});
