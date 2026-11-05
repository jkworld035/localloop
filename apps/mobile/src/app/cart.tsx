import { colors, formatINR, spacing } from '@localloop/shared';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { BackRow } from '@/components/BackRow';
import { BillSummary } from '@/components/shop/BillSummary';
import { QuantityStepper } from '@/components/shop/QuantityStepper';
import { AppText, Banner, Button, Card, EmptyState, ErrorState, LoadingState, Screen } from '@/components/ui';
import { cartItemCount, parseIssue, useCart, useCartQuote } from '@/features/cart/api';
import { issueMessage } from '@/features/cart/issues';
import { useAddToCart } from '@/features/cart/useAddToCart';
import { errorMessage } from '@/lib/errors';

export default function CartScreen() {
  const { t, i18n: i } = useTranslation();
  const te = i.language === 'te';
  const cart = useCart();
  const quote = useCartQuote({ addressId: null, couponCode: null, enabled: true });
  const { change, pendingVariantId } = useAddToCart();
  const count = cartItemCount(cart.data);

  if (cart.isPending) return <LoadingState />;

  const q = quote.data;
  const blocking = q?.issues.filter((x) => !x.startsWith('address_')) ?? [];
  const short = q ? Math.max(0, q.min_order_value - q.subtotal) : 0;

  return (
    <Screen
      edges={['top', 'bottom']}
      footer={
        count > 0 ? (
          <Button
            label={t('cart.checkout')}
            disabled={!q || blocking.length > 0}
            loading={quote.isFetching && !q}
            onPress={() => router.push('/checkout')}
          />
        ) : undefined
      }
    >
      <BackRow title={t('cart.title')} />
      {cart.isError ? (
        <ErrorState error={cart.error} onRetry={() => void cart.refetch()} />
      ) : count === 0 || !cart.data ? (
        <EmptyState icon="cart-outline" message={t('cart.empty')} actionLabel={t('orders.start_shopping')} onAction={() => router.navigate('/home')} />
      ) : (
        <>
          <AppText color={colors.text.secondary}>
            {t('cart.from_store', { store: (te && cart.data.store?.name_te) || cart.data.store?.name })}
          </AppText>
          <Card>
            {cart.data.items
              .slice()
              .sort((a, b) => a.created_at.localeCompare(b.created_at))
              .map((item) => {
                const v = item.variant;
                if (!v || !v.product) return null;
                const name = (te && v.product.name_te) || v.product.name;
                const qItem = q?.items.find((x) => x.variant_id === item.variant_id);
                const itemIssue = q?.issues.find((x) => parseIssue(x).variantId === item.variant_id);
                return (
                  <View key={item.id} style={styles.item}>
                    <View style={styles.flex}>
                      <AppText weight="bold">{name}</AppText>
                      <AppText variant="small" color={colors.text.secondary}>
                        {v.label} · {formatINR(v.sale_price ?? v.price, te ? 'te' : 'en')}
                      </AppText>
                      {itemIssue && (
                        <AppText variant="small" weight="bold" color={colors.status.danger}>
                          {issueMessage(itemIssue)}
                          {qItem?.stock != null ? ` (${t('shop.only_left', { count: qItem.stock })})` : ''}
                        </AppText>
                      )}
                    </View>
                    <QuantityStepper
                      itemName={`${name} ${v.label}`}
                      quantity={item.quantity}
                      max={qItem?.stock ?? null}
                      busy={pendingVariantId === item.variant_id}
                      onChange={(n) => change(cart.data!.store_id, item.variant_id, n)}
                    />
                  </View>
                );
              })}
          </Card>
          <Button
            label={t('cart.add_more')}
            variant="ghost"
            icon="add"
            compact
            onPress={() => router.push({ pathname: '/store/[id]', params: { id: cart.data!.store_id } })}
          />

          {quote.isError && <Banner tone="danger" message={errorMessage(quote.error)} actionLabel={t('common.retry')} onAction={() => void quote.refetch()} />}
          {short > 0 && <Banner tone="info" message={t('cart.min_order_hint', { amount: short })} />}
          {blocking
            .filter((x) => !parseIssue(x).variantId && x !== 'below_min_order')
            .map((x) => (
              <Banner key={x} tone="warning" message={issueMessage(x)} />
            ))}
          {q && (
            <BillSummary
              subtotal={q.subtotal}
              deliveryFee={q.delivery_fee}
              discount={q.discount}
              tax={q.tax}
              total={q.total}
              deliveryFeeKnown={false}
            />
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.surface.border,
  },
  flex: { flex: 1, gap: spacing.xxs },
});
