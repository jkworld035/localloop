import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, WEEKDAYS } from '@localloop/shared';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { AppText, Banner, Button, Card, EmptyState, ErrorState, LoadingState, Screen } from '@/components/ui';
import { publicImageUrl } from '@/features/discovery/api';
import { AcceptingSwitch } from '@/features/vendor/AcceptingSwitch';
import { useMyStore, useUpdateStore, useVendorDocuments } from '@/features/vendor/api';
import { usePhotoPicker } from '@/features/vendor/usePhotoPicker';
import { errorMessage } from '@/lib/errors';

export default function VendorShop() {
  const { t } = useTranslation();
  const store = useMyStore();
  const docs = useVendorDocuments();
  const update = useUpdateStore();
  const photo = usePhotoPicker();

  if (store.isPending) return <LoadingState />;
  if (store.isError) return <ErrorState error={store.error} onRetry={() => void store.refetch()} />;
  const s = store.data;

  if (!s) {
    return (
      <Screen>
        <AppText variant="heading" weight="bold" accessibilityRole="header">
          {t('vendor.tabs.shop')}
        </AppText>
        <EmptyState icon="storefront-outline" message={t('vendor.no_shop')} actionLabel={t('vendor.set_up_shop')} onAction={() => router.push('/vendor/store-edit')} />
      </Screen>
    );
  }

  const setImage = (field: 'logo_path' | 'cover_path') =>
    photo.choose(
      'store-media',
      s.id,
      (path) => update.mutateAsync({ id: s.id, values: { [field]: path } }).then(() => undefined, (e) => Alert.alert(errorMessage(e))),
      field === 'logo_path' ? [1, 1] : [16, 9],
    );
  const cover = publicImageUrl('store-media', s.cover_path);
  const logo = publicImageUrl('store-media', s.logo_path);
  const statusTone = s.status === 'approved' ? 'success' : s.status === 'pending' ? 'info' : 'danger';

  return (
    <Screen refreshing={store.isRefetching} onRefresh={() => void store.refetch()}>
      <AppText variant="heading" weight="bold" accessibilityRole="header">
        {s.name}
      </AppText>
      <Banner tone={statusTone} message={t(`vendor.shop_status.${s.status}`)} />
      {s.status !== 'approved' && s.status_reason && <Banner tone="warning" message={s.status_reason} />}

      {/* Photos */}
      <Pressable accessibilityRole="button" accessibilityLabel={t('vendor.change_cover')} onPress={() => setImage('cover_path')} style={styles.cover}>
        {cover ? (
          <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <View style={styles.placeholder}>
            <Ionicons name="image-outline" size={32} color={colors.text.muted} />
            <AppText color={colors.text.secondary}>{t('vendor.add_cover')}</AppText>
          </View>
        )}
        {photo.busy && <ActivityIndicator style={StyleSheet.absoluteFill} color={colors.brand.forest} />}
      </Pressable>
      <View style={styles.row}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('vendor.change_logo')} onPress={() => setImage('logo_path')} style={styles.logo}>
          {logo ? <Image source={{ uri: logo }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Ionicons name="storefront-outline" size={28} color={colors.text.muted} />}
        </Pressable>
        <View style={styles.flex}>
          <AppText weight="bold">{t('vendor.photos')}</AppText>
          <AppText variant="small" color={colors.text.secondary}>
            {t('vendor.photos_hint')}
          </AppText>
        </View>
      </View>

      {s.status === 'approved' && <AcceptingSwitch store={s} />}

      <Card>
        <AppText weight="bold">{t('vendor.shop_address')}</AppText>
        <AppText color={colors.text.secondary}>
          {s.address_line}, {s.locality}, {s.city} {s.pincode}
        </AppText>
        <AppText weight="bold">{t('vendor.opening_hours')}</AppText>
        {WEEKDAYS.map((d) => {
          const r = (s.opening_hours as Record<string, { open: string; close: string }[]>)[d] ?? [];
          return (
            <View key={d} style={styles.hours}>
              <AppText style={styles.flex}>{t(`weekdays.${d}`)}</AppText>
              <AppText color={r.length ? colors.text.primary : colors.text.secondary}>
                {r.length ? r.map((x) => `${x.open}–${x.close}`).join(', ') : t('common.closed')}
              </AppText>
            </View>
          );
        })}
        <AppText variant="small" color={colors.text.secondary}>
          {t('vendor.delivery_summary', { km: s.delivery_radius_km, min: s.min_order_value, prep: s.avg_prep_minutes })}
        </AppText>
      </Card>

      <Button label={t('vendor.edit_shop')} variant="secondary" icon="create-outline" onPress={() => router.push('/vendor/store-edit')} />
      <Button
        label={`${t('vendor.documents')} (${docs.data?.length ?? 0})`}
        variant="secondary"
        icon="document-text-outline"
        onPress={() => router.push('/vendor/documents')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  cover: { height: 160, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.surface.sunken, alignItems: 'center', justifyContent: 'center' },
  placeholder: { alignItems: 'center', gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  logo: { width: 72, height: 72, borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.surface.sunken, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  hours: { flexDirection: 'row', gap: spacing.md },
});
