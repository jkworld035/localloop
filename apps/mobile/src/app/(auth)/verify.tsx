import { colors } from '@localloop/shared';
import { otpCode } from '@localloop/shared';
import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppText, Banner, Button, Screen, TextField } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

const RESEND_SECONDS = 60; // matches auth.sms.max_frequency

export default function Verify() {
  const { t } = useTranslation();
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [code, setCode] = useState('');
  const [fieldError, setFieldError] = useState<string>();
  const [wait, setWait] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  const verify = useMutation({
    mutationFn: async (token: string) => {
      const { error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
      if (error) throw error;
    },
    // The session listener updates the store; the gate decides where to go next.
    onSuccess: () => router.replace('/'),
  });

  const resend = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signInWithOtp({ phone });
      if (error) throw error;
    },
    onSuccess: () => setWait(RESEND_SECONDS),
  });

  const submit = (value = code) => {
    const parsed = otpCode.safeParse(value);
    if (!parsed.success) return setFieldError(parsed.error.issues[0]?.message);
    setFieldError(undefined);
    verify.mutate(parsed.data);
  };

  const supabaseMessage = verify.error && 'message' in (verify.error as object) ? (verify.error as Error).message : '';
  const otpRejected = /token|otp|expired|invalid/i.test(supabaseMessage);

  return (
    <Screen
      edges={['top', 'bottom']}
      footer={
        <>
          <Button label={t('auth.verify')} loading={verify.isPending} onPress={() => submit()} />
          <Button
            label={wait > 0 ? t('auth.resend_in', { seconds: wait }) : t('auth.resend')}
            variant="ghost"
            disabled={wait > 0}
            loading={resend.isPending}
            onPress={() => resend.mutate()}
          />
        </>
      }
    >
      <AppText variant="heading" weight="bold" accessibilityRole="header">
        {t('auth.otp_title')}
      </AppText>
      <AppText color={colors.text.secondary}>{t('auth.otp_hint', { phone })}</AppText>
      <TextField
        label={t('auth.otp_label')}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={6}
        autoFocus
        value={code}
        onChangeText={(v) => {
          const digits = v.replace(/\D/g, '');
          setCode(digits);
          if (digits.length === 6) submit(digits); // auto-submit on autofill
        }}
        error={fieldError}
        style={{ letterSpacing: 8 }}
      />
      {verify.isError && (
        <Banner tone="danger" message={otpRejected ? t('validation.otp_invalid') : errorMessage(verify.error)} />
      )}
      {resend.isError && <Banner tone="danger" message={errorMessage(resend.error)} />}
      <Button label={t('auth.change_number')} variant="ghost" compact onPress={() => router.back()} />
    </Screen>
  );
}
