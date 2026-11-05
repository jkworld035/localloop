import { zodResolver } from '@hookform/resolvers/zod';
import { MOTORISED_VEHICLES, partnerRegistrationSchema, spacing, VEHICLE_TYPES } from '@localloop/shared';
import { router } from 'expo-router';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import type { z } from 'zod';
import { AppText, Banner, Button, Chip, LoadingState, Screen, TextField } from '@/components/ui';
import { useProfile } from '@/features/account/api';
import { usePartner, useRegisterPartner } from '@/features/partner/api';
import { errorMessage } from '@/lib/errors';

type Input = z.input<typeof partnerRegistrationSchema>;
type Output = z.output<typeof partnerRegistrationSchema>;

export default function PartnerRegister() {
  const { t } = useTranslation();
  const profile = useProfile();
  const partner = usePartner();
  const register = useRegisterPartner();

  const { control, handleSubmit, formState } = useForm<Input, unknown, Output>({
    resolver: zodResolver(partnerRegistrationSchema),
    values: {
      fullName: profile.data?.full_name ?? '',
      email: profile.data?.email ?? '',
      vehicleType: partner.data?.vehicle_type ?? 'motorcycle',
      vehicleRegistration: partner.data?.vehicle_registration ?? '',
      drivingLicence: partner.data?.driving_licence ?? '',
    },
  });
  const vehicle = useWatch({ control, name: 'vehicleType' });
  const motorised = MOTORISED_VEHICLES.includes(vehicle);

  if (profile.isPending || partner.isPending) return <LoadingState />;

  return (
    <Screen
      edges={['top', 'bottom']}
      footer={
        <Button
          label={t('partner.submit')}
          loading={register.isPending}
          onPress={() => void handleSubmit((v) => register.mutate(v, { onSuccess: () => router.replace('/partner') }))()}
        />
      }
    >
      <AppText variant="heading" weight="bold" accessibilityRole="header">
        {t('partner.register_title')}
      </AppText>
      {partner.data?.status === 'rejected' && partner.data.status_reason && (
        <Banner tone="danger" title={t('vendor.rejected_title')} message={partner.data.status_reason} />
      )}
      <Controller
        control={control}
        name="fullName"
        render={({ field }) => (
          <TextField label={t('partner.full_name')} autoComplete="name" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={formState.errors.fullName?.message} />
        )}
      />
      <Controller
        control={control}
        name="vehicleType"
        render={({ field }) => (
          <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel={t('partner.vehicle_type')}>
            <AppText weight="medium">{t('partner.vehicle_type')}</AppText>
            <View style={styles.chips}>
              {VEHICLE_TYPES.map((v) => (
                <Chip key={v} label={t(`vehicles.${v}`)} selected={field.value === v} onPress={() => field.onChange(v)} />
              ))}
            </View>
          </View>
        )}
      />
      {motorised && (
        <>
          <Controller
            control={control}
            name="vehicleRegistration"
            render={({ field }) => (
              <TextField
                label={t('partner.vehicle_registration')}
                hint={t('partner.vehicle_registration_hint')}
                autoCapitalize="characters"
                value={field.value ?? ''}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={formState.errors.vehicleRegistration?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="drivingLicence"
            render={({ field }) => (
              <TextField
                label={t('partner.driving_licence')}
                autoCapitalize="characters"
                value={field.value ?? ''}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={formState.errors.drivingLicence?.message}
              />
            )}
          />
        </>
      )}
      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <TextField
            label={t('partner.email')}
            optional
            keyboardType="email-address"
            autoCapitalize="none"
            value={field.value ?? ''}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={formState.errors.email?.message}
          />
        )}
      />
      {register.isError && <Banner tone="danger" message={errorMessage(register.error)} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
