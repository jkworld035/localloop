import { Ionicons } from '@expo/vector-icons';
import { colors, formatDistance, radii, spacing, type RpcReturns } from '@localloop/shared';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { AppText, Card } from '@/components/ui';
import { publicImageUrl } from './api';

export type NearbyStore = RpcReturns<'nearby_stores'>[number];

/** A nearby shop. Every value shown comes from the nearby_stores RPC — nothing is estimated client-side. */
export function StoreCard({ store }: { store: NearbyStore }) {
  const { t, i18n } = useTranslation();
  const te = i18n.language === 'te';
  const name = te && store.name_te ? store.name_te : store.name;
  const category = te ? store.category_name_te : store.category_name_en;
  const distance = formatDistance(store.distance_m);
  const cover = publicImageUrl('store-media', store.cover_path ?? store.logo_path);
  const open = store.is_open && store.is_accepting_orders;

  const summary = [
    name,
    category,
    `${distance.value} ${t(`common.${distance.unit}`)}`,
    open ? t('common.open') : t('common.closed'),
    store.delivers_here ? t('home.delivers_here') : t('home.pickup_only_area'),
  ].join(', ');

  return (
    <Card style={styles.card} accessible accessibilityLabel={summary}>
      <View style={styles.row}>
        {cover ? (
          <Image source={{ uri: cover }} style={styles.image} contentFit="cover" transition={150} accessibilityIgnoresInvertColors />
        ) : (
          <View style={[styles.image, styles.placeholder]}>
            <Ionicons name="storefront" size={32} color={colors.brand.green} />
          </View>
        )}
        <View style={styles.body}>
          <AppText variant="title" weight="bold" numberOfLines={1}>
            {name}
          </AppText>
          <AppText variant="small" color={colors.text.secondary} numberOfLines={1}>
            {category} · {store.locality}
          </AppText>
          <View style={styles.meta}>
            <AppText variant="small" weight="medium">
              {distance.value} {t(`common.${distance.unit}`)}
            </AppText>
            <AppText variant="small" weight="medium" color={open ? colors.status.success : colors.status.danger}>
              {open ? t('common.open') : t('common.closed')}
            </AppText>
            {store.rating_count > 0 ? (
              <View style={styles.rating}>
                <Ionicons name="star" size={14} color={colors.brand.amber} />
                <AppText variant="small" weight="medium">
                  {t('home.ratings', { rating: store.rating_avg.toFixed(1), count: store.rating_count })}
                </AppText>
              </View>
            ) : (
              <AppText variant="small" color={colors.text.secondary}>
                {t('home.new_store')}
              </AppText>
            )}
          </View>
        </View>
      </View>
      <View style={styles.footer}>
        {store.delivers_here ? (
          <AppText variant="small" color={colors.text.secondary}>
            {t('home.eta_range', { min: store.est_minutes_min, max: store.est_minutes_max })} ({t('common.approx')}) ·{' '}
            {t('home.min_order', { amount: store.min_order_value })}
          </AppText>
        ) : (
          <AppText variant="small" color={colors.status.warning}>
            {t('home.pickup_only_area')}
          </AppText>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
  image: { width: 84, height: 84, borderRadius: radii.md, backgroundColor: colors.surface.sunken },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: spacing.xxs },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.xs },
  rating: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.surface.border, paddingTop: spacing.sm },
});
