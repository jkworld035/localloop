import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { addressSchema, colors, spacing, type AddressInput } from '@localloop/shared';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Controller, useForm, type FieldPath } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import type { z } from 'zod';
import { BackRow } from '@/components/BackRow';
import { AppText, Banner, Button, Card, Screen, TextField } from '@/components/ui';
import { useProfile } from '@/features/account/api';
import { useSaveAddress } from '@/features/addresses/api';
import { errorMessage } from '@/lib/errors';
import { useAddressDraft, useCheckout } from '@/stores/checkout';
import { useSelectedLocation } from '@/stores/location';

type Output = z.output<typeof addressSchema>;

export default function NewAddress() {
  const { t } = useTranslation();
  const { select } = useLocalSearchParams<{ select?: string }>();
  const profile = useProfile();
  const selected = useSelectedLocation((s) => s.selected);
  const draft = useAddressDraft();
  const save = useSaveAddress();
  const choose = useCheckout((s) => s.setAddress);

  // The pin: a point placed on the map for this address, else the customer's current location.
  const point = useMemo(
    () => draft.point ?? (selected ? { latitude: selected.latitude, longitude: selected.longitude } : null),
    [draft.point, selected],
  );

  const { control, handleSubmit, formState, setValue, getValues } = useForm<AddressInput, unknown, Output>({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      label: 'Home',
      contactName: profile.data?.full_name ?? '',
      contactPhone: profile.data?.phone?.replace('+91', '') ?? '',
      line1: '',
      line2: '',
      landmark: '',
      locality: '',
      city: '',
      state: 'Telangana',
      pincode: '',
      location: point ?? undefined,
      isDefault: true,
    },
  });

  // Keep the form's location in sync with the pin and pre-fill area fields from it (never overwriting typed values).
  useEffect(() => {
    if (!point) return;
    setValue('location', point, { shouldValidate: formState.isSubmitted });
    void Location.reverseGeocodeAsync(point)
      .then(([place]) => {
        if (!place) return;
        const fill = (field: FieldPath<AddressInput>, value: string | null | undefined) => {
          if (value && !getValues(field)) setValue(field, value);
        };
        fill('locality', place.district ?? place.subregion);
        fill('city', place.city ?? place.subregion);
        if (place.region) setValue('state', place.region);
        fill('pincode', place.postalCode);
        fill('line2', place.street);
      })
      .catch(() => undefined); // offline: the user types the fields
  }, [point, setValue, getValues, formState.isSubmitted]);

  useEffect(() => () => draft.setPoint(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = handleSubmit((values) =>
    save.mutate(values, {
      onSuccess: (id) => {
        if (select === '1') choose(id);
        router.back();
      },
    }),
  );

  const field = (name: Exclude<FieldPath<AddressInput>, 'location' | 'location.latitude' | 'location.longitude' | 'isDefault'>, label: string, extra: object = {}) => (
    <Controller
      control={control}
      name={name}
      render={({ field: f }) => (
        <TextField
          label={label}
          value={String(f.value ?? '')}
          onChangeText={f.onChange}
          onBlur={f.onBlur}
          error={(formState.errors as Record<string, { message?: string } | undefined>)[name]?.message}
          {...extra}
        />
      )}
    />
  );

  return (
    <Screen edges={['top', 'bottom']} footer={<Button label={t('address.save')} loading={save.isPending} onPress={() => void submit()} />}>
      <BackRow title={t('address.add')} />

      <Card>
        <View style={styles.row}>
          <Ionicons name="location" size={24} color={colors.brand.forest} />
          <View style={styles.flex}>
            <AppText weight="bold">{t('address.location')}</AppText>
            <AppText variant="small" color={colors.text.secondary}>
              {point ? (draft.point ? t('address.pin_set') : t('address.using_location')) : t('address.no_location')}
            </AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            hitSlop={10}
            onPress={() =>
              router.push({
                pathname: '/location-map',
                params: { purpose: 'address', ...(point ? { lat: point.latitude, lng: point.longitude } : {}) },
              })
            }
          >
            <AppText weight="bold" color={colors.brand.forest}>
              {t('address.adjust_pin')}
            </AppText>
          </Pressable>
        </View>
        {formState.errors.location && <Banner tone="danger" message={t('address.no_location')} />}
      </Card>

      {field('line1', t('address.line1'), { autoComplete: 'street-address' })}
      {field('line2', t('address.line2'))}
      {field('landmark', t('address.landmark'), { optional: true })}
      {field('locality', t('address.locality'))}
      <View style={styles.pair}>
        <View style={styles.flex}>{field('city', t('address.city'))}</View>
        <View style={styles.flex}>{field('pincode', t('address.pincode'), { keyboardType: 'number-pad', maxLength: 6 })}</View>
      </View>
      {field('state', t('address.state'))}
      {field('contactName', t('address.contact_name'), { autoComplete: 'name' })}
      {field('contactPhone', t('address.contact_phone'), { keyboardType: 'phone-pad', prefix: '+91', maxLength: 14 })}
      {field('label', t('address.label'), { hint: t('address.label_hint'), maxLength: 30 })}

      <Controller
        control={control}
        name="isDefault"
        render={({ field: f }) => (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: !!f.value }}
            onPress={() => f.onChange(!f.value)}
            style={styles.checkbox}
          >
            <Ionicons name={f.value ? 'checkbox' : 'square-outline'} size={26} color={colors.brand.forest} />
            <AppText>{t('address.default')}</AppText>
          </Pressable>
        )}
      />
      {save.isError && <Banner tone="danger" message={errorMessage(save.error)} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  pair: { flexDirection: 'row', gap: spacing.md },
  checkbox: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48 },
});
