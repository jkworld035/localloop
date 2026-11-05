import { Ionicons } from '@expo/vector-icons';
import { colors, elevation, formatINR, radii, spacing, touchTarget } from '@localloop/shared';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/ui';
import { cartItemCount, cartSubtotal, useCart } from '@/features/cart/api';

/** Floating "View cart" bar shown on shop and product pages while the cart has items. */
export function CartBar() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { data: cart } = useCart();
  const count = cartItemCount(cart);
  if (!cart || count === 0) return null;
  const te = i18n.language === 'te';
  const storeName = (te && cart.store?.name_te) || cart.store?.name || '';

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('cart.view_cart')}, ${t('cart.items', { count })}, ${formatINR(cartSubtotal(cart))}`}
        onPress={() => router.push('/cart')}
        style={({ pressed }) => [styles.bar, pressed && { backgroundColor: colors.brand.green }]}
      >
        <View style={styles.flex}>
          <AppText weight="bold" color={colors.text.onBrand}>
            {t('cart.items', { count })} · {formatINR(cartSubtotal(cart), te ? 'te' : 'en')}
          </AppText>
          <AppText variant="caption" color={colors.text.onBrand} numberOfLines={1}>
            {storeName}
          </AppText>
        </View>
        <AppText weight="bold" color={colors.text.onBrand}>
          {t('cart.view_cart')}
        </AppText>
        <Ionicons name="chevron-forward" size={20} color={colors.text.onBrand} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, backgroundColor: 'transparent' },
  bar: {
    minHeight: touchTarget.comfortable,
    borderRadius: radii.lg,
    backgroundColor: colors.brand.forest,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    ...elevation.raised,
  },
  flex: { flex: 1 },
});
