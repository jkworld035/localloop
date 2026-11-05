import { colors, formatINR, spacing } from '@localloop/shared';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { AppText, Card } from '@/components/ui';

/** Bill breakdown. Every number comes from the server (quote_cart or the stored order). */
export function BillSummary({
  subtotal,
  deliveryFee,
  discount,
  tax,
  total,
  deliveryFeeKnown = true,
}: {
  subtotal: number;
  deliveryFee: number;
  discount: number;
  tax: number;
  total: number;
  deliveryFeeKnown?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'te' ? 'te' : 'en';
  const row = (label: string, value: string, strong = false, color?: string) => (
    <View style={styles.row} key={label}>
      <AppText weight={strong ? 'bold' : 'regular'} variant={strong ? 'bodyLarge' : 'body'}>
        {label}
      </AppText>
      <AppText weight={strong ? 'bold' : 'medium'} variant={strong ? 'bodyLarge' : 'body'} color={color}>
        {value}
      </AppText>
    </View>
  );
  return (
    <Card>
      <AppText variant="title" weight="bold">
        {t('cart.bill')}
      </AppText>
      {row(t('cart.subtotal'), formatINR(subtotal, lang))}
      {row(
        t('cart.delivery_fee'),
        !deliveryFeeKnown ? t('cart.fee_after_address') : deliveryFee === 0 ? t('cart.free') : formatINR(deliveryFee, lang),
        false,
        deliveryFeeKnown && deliveryFee === 0 ? colors.status.success : undefined,
      )}
      {tax > 0 && row(t('cart.tax'), formatINR(tax, lang))}
      {discount > 0 && row(t('cart.discount'), `− ${formatINR(discount, lang)}`, false, colors.status.success)}
      <View style={styles.divider} />
      {row(t('cart.total'), formatINR(total, lang), true)}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.surface.border, marginVertical: spacing.xs },
});
