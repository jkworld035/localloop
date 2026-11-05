import { zodResolver } from '@hookform/resolvers/zod';
import { colors, spacing, vendorRegistrationSchema } from '@localloop/shared';
import { router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import type { z } from 'zod';
import { AppText, Banner, Button, Chip, ErrorState, LoadingState, Screen, TextField } from '@/components/ui';
import { useProfile } from '@/features/account/api';
import { useCategories } from '@/features/discovery/api';
import { useRegisterVendor, useVendor } from '@/features/vendor/api';
import { errorMessage } from '@/lib/errors';

type Input = z.input<typeof vendorRegistrationSchema>;
type Output = z.output<typeof vendorRegistrationSchema>;

export default function VendorRegister() {
  const { t, i18n } = useTranslation();
  const te = i18n.language === 'te';
  const profile = useProfile();
  const vendor = useVendor();
  const categories = useCategories('store');
  const register = useRegisterVendor();

  const { control, handleSubmit, formState } = useForm<Input, unknown, Output>({
    resolver: zodResolver(vendorRegistrationSchema),
    values: {
      ownerName: vendor.data?.owner_name ?? profile.data?.full_name ?? '',
      businessName: vendor.data?.business_name ?? '',
      businessCategoryId: vendor.data?.business_category_id ?? '',
      gstin: vendor.data?.gstin ?? '',
      email: profile.data?.email ?? '',
    },
  });

  const submit = handleSubmit((v) =>
    register.mutate(
      { ownerName: v.ownerName, businessName: v.businessName, businessCategoryId: v.businessCategoryId, gstin: v.gstin, email: v.email },
      { onSuccess: () => router.replace('/vendor') },
    ),
  );

  if (categories.isPending || vendor.isPending) return <LoadingState />;
  if (categories.isError) return <ErrorState error={categories.error} onRetry={() => void categories.refetch()} />;

  return (
    <Screen edges={['top', 'bottom']} footer={<Button label={t('vendor.submit')} loading={register.isPending} onPress={() => void submit()} />}>
      <AppText variant="heading" weight="bold" accessibilityRole="header">
        {t('vendor.register_title')}
      </AppText>
      {vendor.data?.status === 'rejected' && vendor.data.status_reason && (
        <Banner tone="danger" title={t('vendor.rejected_title')} message={vendor.data.status_reason} />
      )}
      <Controller
        control={control}
        name="ownerName"
        render={({ field }) => (
          <TextField label={t('vendor.owner_name')} autoComplete="name" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={formState.errors.ownerName?.message} />
        )}
      />
      <Controller
        control={control}
        name="businessName"
        render={({ field }) => (
          <TextField label={t('vendor.business_name')} value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={formState.errors.businessName?.message} />
        )}
      />
      <Controller
        control={control}
        name="businessCategoryId"
        render={({ field }) => (
          <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel={t('vendor.business_category')}>
            <AppText weight="medium">{t('vendor.business_category')}</AppText>
            <View style={styles.chips}>
              {categories.data.map((c) => (
                <Chip key={c.id} label={te ? c.name_te : c.name_en} selected={field.value === c.id} onPress={() => field.onChange(c.id)} />
              ))}
            </View>
            {formState.errors.businessCategoryId && (
              <AppText variant="small" color={colors.status.danger}>
                {t('validation.required')}
              </AppText>
            )}
          </View>
        )}
      />
      <Controller
        control={control}
        name="gstin"
        render={({ field }) => (
          <TextField
            label={t('vendor.gstin')}
            optional
            hint={t('vendor.gstin_hint')}
            autoCapitalize="characters"
            maxLength={15}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={formState.errors.gstin?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <TextField
            label={t('vendor.email')}
            optional
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
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
