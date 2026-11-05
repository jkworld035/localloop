import { Ionicons } from '@expo/vector-icons';
import { colors, openingHoursSchema, spacing, storeSchema, type OpeningHours } from '@localloop/shared';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { BackRow } from '@/components/BackRow';
import { AppText, Banner, Button, Card, Chip, ErrorState, LoadingState, Screen, TextField } from '@/components/ui';
import { useCategories } from '@/features/discovery/api';
import { HoursEditor } from '@/features/vendor/HoursEditor';
import { useMyStore, useSaveStore, useVendor } from '@/features/vendor/api';
import { errorMessage } from '@/lib/errors';
import { labelFor } from '@/services/location';
import { useAddressDraft } from '@/stores/checkout';
import { useSelectedLocation } from '@/stores/location';

const DEFAULT_HOURS: OpeningHours = {
  mon: [{ open: '09:00', close: '21:00' }],
  tue: [{ open: '09:00', close: '21:00' }],
  wed: [{ open: '09:00', close: '21:00' }],
  thu: [{ open: '09:00', close: '21:00' }],
  fri: [{ open: '09:00', close: '21:00' }],
  sat: [{ open: '09:00', close: '21:00' }],
  sun: [{ open: '09:00', close: '13:00' }],
};

type Errors = Partial<Record<string, string>>;

/** Create or edit the vendor's shop. Moving an approved shop sends it back for re-verification (enforced in the database). */
export default function StoreEdit() {
  const { t, i18n } = useTranslation();
  const te = i18n.language === 'te';
  const vendor = useVendor();
  const store = useMyStore();
  const categories = useCategories('store');
  const save = useSaveStore();
  const pin = useAddressDraft();
  const here = useSelectedLocation((s) => s.selected);
  const s = store.data;

  const [form, setForm] = useState(() => ({
    name: '',
    nameTe: '',
    description: '',
    categoryId: '',
    phone: '',
    addressLine: '',
    locality: '',
    city: '',
    state: 'Telangana',
    pincode: '',
    deliveryRadiusKm: '5',
    minOrderValue: '0',
    avgPrepMinutes: '15',
  }));
  const [hours, setHours] = useState<OpeningHours>(DEFAULT_HOURS);
  const [errors, setErrors] = useState<Errors>({});
  const [loaded, setLoaded] = useState(false);

  // Load the existing shop once.
  useEffect(() => {
    if (loaded || store.isPending || vendor.isPending) return;
    if (s) {
      setForm({
        name: s.name,
        nameTe: s.name_te,
        description: s.description,
        categoryId: s.category_id,
        phone: s.phone.replace('+91', ''),
        addressLine: s.address_line,
        locality: s.locality,
        city: s.city,
        state: s.state,
        pincode: s.pincode,
        deliveryRadiusKm: String(s.delivery_radius_km),
        minOrderValue: String(s.min_order_value),
        avgPrepMinutes: String(s.avg_prep_minutes),
      });
      const parsed = openingHoursSchema.safeParse(s.opening_hours);
      if (parsed.success) setHours(parsed.data);
    } else if (vendor.data) {
      setForm((f) => ({ ...f, name: vendor.data!.business_name, categoryId: vendor.data!.business_category_id ?? '' }));
    }
    setLoaded(true);
  }, [loaded, s, store.isPending, vendor.isPending, vendor.data]);

  useEffect(() => () => pin.setPoint(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  const point = useMemo(
    () => pin.point ?? s?.point ?? (here ? { latitude: here.latitude, longitude: here.longitude } : null),
    [pin.point, s?.point, here],
  );
  const [pointLabel, setPointLabel] = useState<string | null>(null);
  useEffect(() => {
    if (point) void labelFor(point.latitude, point.longitude).then(setPointLabel);
  }, [point]);

  if (store.isPending || categories.isPending || !loaded) return <LoadingState />;
  if (categories.isError) return <ErrorState error={categories.error} onRetry={() => void categories.refetch()} />;

  const up = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const moved = !!s && s.status === 'approved' && !!pin.point;

  const submit = () => {
    const parsed = storeSchema.safeParse({
      ...form,
      location: point ?? undefined,
      deliveryRadiusKm: Number(form.deliveryRadiusKm),
      minOrderValue: Number(form.minOrderValue),
      avgPrepMinutes: Number(form.avgPrepMinutes),
      openingHours: hours,
    });
    if (!parsed.success) {
      const e: Errors = {};
      for (const issue of parsed.error.issues) e[String(issue.path[0])] ??= issue.message;
      setErrors(e);
      return;
    }
    setErrors({});
    save.mutate({ id: s?.id ?? null, form: parsed.data }, { onSuccess: () => router.back() });
  };

  return (
    <Screen edges={['top', 'bottom']} footer={<Button label={t('vendor.save_shop')} loading={save.isPending} onPress={submit} />}>
      <BackRow title={s ? t('vendor.edit_shop') : t('vendor.set_up_shop')} />

      <TextField label={t('vendor.shop_name')} value={form.name} onChangeText={up('name')} error={errors.name} />
      <TextField label={t('vendor.shop_name_te')} optional value={form.nameTe} onChangeText={up('nameTe')} hint={t('vendor.shop_name_te_hint')} />
      <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel={t('vendor.business_category')}>
        <AppText weight="medium">{t('vendor.business_category')}</AppText>
        <View style={styles.chips}>
          {categories.data.map((c) => (
            <Chip key={c.id} label={te ? c.name_te : c.name_en} selected={form.categoryId === c.id} onPress={() => up('categoryId')(c.id)} />
          ))}
        </View>
        {errors.categoryId && (
          <AppText variant="small" color={colors.status.danger}>
            {t('validation.required')}
          </AppText>
        )}
      </View>
      <TextField label={t('vendor.shop_phone')} prefix="+91" keyboardType="phone-pad" maxLength={14} value={form.phone} onChangeText={up('phone')} error={errors.phone} />
      <TextField label={t('vendor.shop_description')} optional multiline maxLength={1000} value={form.description} onChangeText={up('description')} />

      {/* Location */}
      <Card>
        <View style={styles.row}>
          <Ionicons name="location" size={24} color={colors.brand.forest} />
          <View style={styles.flex}>
            <AppText weight="bold">{t('vendor.shop_location')}</AppText>
            <AppText variant="small" color={colors.text.secondary}>
              {point ? pointLabel ?? t('address.pin_set') : t('address.no_location')}
            </AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => router.push({ pathname: '/location-map', params: { purpose: 'store', ...(point ? { lat: point.latitude, lng: point.longitude } : {}) } })}
          >
            <AppText weight="bold" color={colors.brand.forest}>
              {t('address.adjust_pin')}
            </AppText>
          </Pressable>
        </View>
        <AppText variant="small" color={colors.text.secondary}>
          {t('vendor.pin_hint')}
        </AppText>
        {errors.location && <Banner tone="danger" message={t('address.no_location')} />}
        {moved && <Banner tone="warning" message={t('vendor.move_needs_review')} />}
      </Card>
      <TextField label={t('vendor.shop_address')} value={form.addressLine} onChangeText={up('addressLine')} error={errors.addressLine} />
      <TextField label={t('address.locality')} value={form.locality} onChangeText={up('locality')} error={errors.locality} />
      <View style={styles.pair}>
        <View style={styles.flex}>
          <TextField label={t('address.city')} value={form.city} onChangeText={up('city')} error={errors.city} />
        </View>
        <View style={styles.flex}>
          <TextField label={t('address.pincode')} keyboardType="number-pad" maxLength={6} value={form.pincode} onChangeText={up('pincode')} error={errors.pincode} />
        </View>
      </View>
      <TextField label={t('address.state')} value={form.state} onChangeText={up('state')} error={errors.state} />

      {/* Delivery settings */}
      <AppText variant="title" weight="bold">
        {t('vendor.delivery_settings')}
      </AppText>
      <View style={styles.pair}>
        <View style={styles.flex}>
          <TextField label={t('vendor.delivery_radius')} keyboardType="decimal-pad" value={form.deliveryRadiusKm} onChangeText={up('deliveryRadiusKm')} error={errors.deliveryRadiusKm ? t('vendor.radius_range') : undefined} />
        </View>
        <View style={styles.flex}>
          <TextField label={t('vendor.prep_minutes')} keyboardType="number-pad" value={form.avgPrepMinutes} onChangeText={up('avgPrepMinutes')} error={errors.avgPrepMinutes ? t('vendor.prep_range') : undefined} />
        </View>
      </View>
      <TextField label={t('vendor.min_order')} prefix="₹" keyboardType="decimal-pad" value={form.minOrderValue} onChangeText={up('minOrderValue')} error={errors.minOrderValue} />

      <AppText variant="title" weight="bold">
        {t('vendor.opening_hours')}
      </AppText>
      <HoursEditor value={hours} onChange={setHours} />
      {errors.openingHours && <Banner tone="danger" message={t('validation.time_invalid')} />}
      {save.isError && <Banner tone="danger" message={errorMessage(save.error)} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  pair: { flexDirection: 'row', gap: spacing.md },
});
