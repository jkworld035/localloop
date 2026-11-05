import { zodResolver } from '@hookform/resolvers/zod';
import { colors } from '@localloop/shared';
import { indianMobile } from '@localloop/shared';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { AppText, Banner, Button, Screen, TextField } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

const schema = z.object({ phone: indianMobile });

export default function Phone() {
  const { t } = useTranslation();
  const { control, handleSubmit, formState } = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { phone: '' },
  });

  const send = useMutation({
    mutationFn: async (phone: string) => {
      const { error } = await supabase.auth.signInWithOtp({ phone, options: { channel: 'sms' } });
      if (error) throw error;
      return phone;
    },
    onSuccess: (phone) => router.push({ pathname: '/verify', params: { phone } }),
  });

  const submit = handleSubmit(({ phone }) => send.mutate(phone));

  return (
    <Screen
      edges={['top', 'bottom']}
      footer={
        <>
          <Button label={t('auth.send_code')} loading={send.isPending} onPress={() => void submit()} />
          <AppText variant="caption" align="center" color={colors.text.secondary}>
            {t('auth.terms_notice')}
          </AppText>
        </>
      }
    >
      <AppText variant="heading" weight="bold" accessibilityRole="header">
        {t('auth.phone_title')}
      </AppText>
      <AppText color={colors.text.secondary}>{t('auth.phone_hint')}</AppText>
      <Controller
        control={control}
        name="phone"
        render={({ field }) => (
          <TextField
            label={t('auth.phone_label')}
            prefix="+91"
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            maxLength={14}
            autoFocus
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={formState.errors.phone?.message}
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
          />
        )}
      />
      {send.isError && <Banner tone="danger" message={errorMessage(send.error)} />}
    </Screen>
  );
}
