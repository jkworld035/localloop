import { colors, formatINR, spacing } from '@localloop/shared';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui';

/** Selling price, with struck-through MRP and % off when on sale. */
export function Price({ price, salePrice, large }: { price: number; salePrice: number | null; large?: boolean }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'te' ? 'te' : 'en';
  const onSale = salePrice != null && salePrice < price;
  const pct = onSale ? Math.round(((price - salePrice) / price) * 100) : 0;
  return (
    <View style={styles.row}>
      <AppText variant={large ? 'heading' : 'bodyLarge'} weight="bold">
        {formatINR(onSale ? salePrice : price, lang)}
      </AppText>
      {onSale && (
        <>
          <AppText
            variant="small"
            color={colors.text.secondary}
            style={styles.strike}
            accessibilityLabel={`${t('shop.mrp')} ${formatINR(price, lang)}`}
          >
            {formatINR(price, lang)}
          </AppText>
          <AppText variant="small" weight="bold" color={colors.status.success}>
            {t('shop.off', { percent: pct })}
          </AppText>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, flexWrap: 'wrap' },
  strike: { textDecorationLine: 'line-through' },
});
