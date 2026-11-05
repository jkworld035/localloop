import { Ionicons } from '@expo/vector-icons';
import { colors, formatINR, radii, spacing, type PaymentMethod } from '@localloop/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { BackRow } from '@/components/BackRow';
import { BillSummary } from '@/components/shop/BillSummary';
import { AppText, Banner, Button, Card, ErrorState, LoadingState, Screen, TextField } from '@/components/ui';
import { formatAddress, useAddresses } from '@/features/addresses/api';
import { cartItemCount, useCart, useCartQuote } from '@/features/cart/api';
import { issueMessage } from '@/features/cart/issues';
import { usePlaceOrder, useTestPaymentsEnabled } from '@/features/orders/api';
import { errorMessage } from '@/lib/errors';
import { useCheckout } from '@/stores/checkout';

export default function Checkout() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'te' ? 'te' : 'en';
  const cart = useCart();
  const addresses = useAddresses();
  const testPayments = useTestPaymentsEnabled();
  const checkout = useCheckout();
  const [couponInput, setCouponInput] = useState(checkout.couponCode ?? '');
  const place = usePlaceOrder();

  // Default to the saved default address (or the newest one) when nothing is chosen yet.
  useEffect(() => {
    const list = addresses.data;
    if (!list?.length) return;
    if (!checkout.addressId || !list.some((a) => a.id === checkout.addressId)) checkout.setAddress(list[0]!.id);
  }, [addresses.data, checkout]);

  const address = addresses.data?.find((a) => a.id === checkout.addressId) ?? null;
  const quote = useCartQuote({ addressId: address?.id ?? null, couponCode: checkout.couponCode, enabled: !!address });

  if (cart.isPending || addresses.isPending) return <LoadingState />;
  if (addresses.isError) return <ErrorState error={addresses.error} onRetry={() => void addresses.refetch()} />;
  if (!cart.data || cartItemCount(cart.data) === 0) {
    return (
      <Screen edges={['top', 'bottom']}>
        <BackRow title={t('checkout.title')} />
        <Banner tone="info" message={t('cart.empty')} actionLabel={t('orders.start_shopping')} onAction={() => router.navigate('/home')} />
      </Screen>
    );
  }

  const q = quote.data;
  const couponIssue = q?.issues.find((x) => x.startsWith('coupon_'));
  const blocking = q?.issues ?? [];
  const canPlace = !!address && !!q && blocking.length === 0 && !quote.isFetching;

  const submit = () => {
    if (!address || !q) return;
    place.mutate(
      {
        addressId: address.id,
        paymentMethod: checkout.paymentMethod,
        idempotencyKey: checkout.idempotencyKey,
        couponCode: checkout.couponCode,
        instructions: checkout.instructions.trim(),
      },
      {
        onSuccess: (res) => {
          checkout.completed();
          router.dismissAll();
          router.replace({ pathname: '/order/[id]', params: { id: res.order_id, placed: '1' } });
        },
        // A changed price/stock is re-quoted so the user sees the new state before retrying.
        onError: () => void quote.refetch(),
      },
    );
  };

  const methods: PaymentMethod[] = testPayments.data ? ['cod', 'test'] : ['cod'];

  return (
    <Screen
      edges={['top', 'bottom']}
      footer={
        <Button
          label={q ? t('checkout.place_order', { total: formatINR(q.total, lang) }) : t('checkout.place_order_plain')}
          disabled={!canPlace}
          loading={place.isPending}
          onPress={submit}
        />
      }
    >
      <BackRow title={t('checkout.title')} />

      {/* Address */}
      <Card>
        <View style={styles.rowBetween}>
          <AppText variant="title" weight="bold">
            {t('checkout.deliver_to')}
          </AppText>
          {address && (
            <Pressable accessibilityRole="button" hitSlop={12} onPress={() => router.push({ pathname: '/addresses', params: { select: '1' } })}>
              <AppText weight="bold" color={colors.brand.forest}>
                {t('location.change')}
              </AppText>
            </Pressable>
          )}
        </View>
        {address ? (
          <View style={styles.addr}>
            <Ionicons name="home-outline" size={22} color={colors.brand.forest} />
            <View style={styles.flex}>
              <AppText weight="bold">
                {address.label} · {address.contact_name}
              </AppText>
              <AppText color={colors.text.secondary}>{formatAddress(address)}</AppText>
              <AppText variant="small" color={colors.text.secondary}>
                {address.contact_phone}
              </AppText>
            </View>
          </View>
        ) : (
          <>
            <AppText color={colors.text.secondary}>{t('checkout.needs_address')}</AppText>
            <Button
              label={t('address.add')}
              icon="add"
              variant="secondary"
              onPress={() => router.push({ pathname: '/addresses/new', params: { select: '1' } })}
            />
          </>
        )}
      </Card>

      <TextField
        label={t('checkout.instructions')}
        optional
        hint={t('checkout.instructions_hint')}
        value={checkout.instructions}
        onChangeText={checkout.setInstructions}
        maxLength={300}
        multiline
      />

      {/* Coupon */}
      <View style={styles.coupon}>
        <View style={styles.flex}>
          <TextField
            label={t('cart.coupon')}
            optional
            autoCapitalize="characters"
            value={couponInput}
            onChangeText={setCouponInput}
            maxLength={20}
            error={couponIssue ? issueMessage(couponIssue) : undefined}
          />
        </View>
        <View style={styles.couponButton}>
          {checkout.couponCode ? (
            <Button
              label={t('cart.remove')}
              variant="ghost"
              compact
              onPress={() => {
                setCouponInput('');
                checkout.setCoupon(null);
              }}
            />
          ) : (
            <Button label={t('cart.apply')} variant="secondary" compact disabled={!couponInput.trim()} onPress={() => checkout.setCoupon(couponInput)} />
          )}
        </View>
      </View>

      {/* Payment */}
      <Card>
        <AppText variant="title" weight="bold">
          {t('checkout.payment')}
        </AppText>
        <View accessibilityRole="radiogroup" style={styles.methods}>
          {methods.map((m) => {
            const on = checkout.paymentMethod === m;
            return (
              <Pressable
                key={m}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => checkout.setPaymentMethod(m)}
                style={[styles.method, on && styles.methodOn]}
              >
                <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={24} color={on ? colors.brand.forest : colors.text.muted} />
                <View style={styles.flex}>
                  <AppText weight="bold">{t(`payment_method.${m}`)}</AppText>
                  <AppText variant="small" color={colors.text.secondary}>
                    {t(`checkout.${m}_hint`)}
                  </AppText>
                </View>
              </Pressable>
            );
          })}
        </View>
      </Card>

      {/* Price check from the server */}
      {quote.isError && (
        <Banner tone="danger" message={errorMessage(quote.error)} actionLabel={t('common.retry')} onAction={() => void quote.refetch()} />
      )}
      {blocking
        .filter((x) => !x.startsWith('coupon_'))
        .map((x) => (
          <Banner key={x} tone="warning" message={issueMessage(x)} actionLabel={t('cart.view_cart')} onAction={() => router.back()} />
        ))}
      {q && <BillSummary subtotal={q.subtotal} deliveryFee={q.delivery_fee} discount={q.discount} tax={q.tax} total={q.total} />}
      {place.isError && <Banner tone="danger" message={errorMessage(place.error)} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addr: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  flex: { flex: 1, gap: spacing.xxs },
  coupon: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  couponButton: { paddingTop: 28 },
  methods: { gap: spacing.sm },
  method: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 64,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.surface.border,
  },
  methodOn: { borderColor: colors.brand.forest, borderWidth: 2 },
});
