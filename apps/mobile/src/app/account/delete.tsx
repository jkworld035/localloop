import { colors, spacing } from '@localloop/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { BackRow } from '@/components/BackRow';
import { AppText, Banner, Button, Card, Screen, TextField } from '@/components/ui';
import { useDeleteAccount } from '@/features/account/api';
import { errorMessage } from '@/lib/errors';

/** Permanent account deletion (app store requirement). Typing DELETE guards against accidental taps. */
export default function DeleteAccount() {
  const { t } = useTranslation();
  const del = useDeleteAccount();
  const [confirm, setConfirm] = useState('');
  const ok = confirm.trim().toUpperCase() === 'DELETE';

  return (
    <Screen edges={['top', 'bottom']}>
      <BackRow title={t('account_delete.title')} />
      <Card>
        <AppText weight="bold">{t('account_delete.what_happens')}</AppText>
        {(['point_personal', 'point_signin', 'point_shop', 'point_records'] as const).map((k) => (
          <View key={k} style={styles.point}>
            <AppText>•</AppText>
            <AppText style={styles.flex}>{t(`account_delete.${k}`)}</AppText>
          </View>
        ))}
      </Card>
      <Banner tone="warning" message={t('account_delete.cannot_undo')} />
      <TextField label={t('account_delete.type_delete')} value={confirm} onChangeText={setConfirm} autoCapitalize="characters" autoCorrect={false} />
      {del.isError && <Banner tone="danger" message={errorMessage(del.error)} />}
      <Button
        label={t('account_delete.confirm')}
        variant="danger"
        icon="trash-outline"
        disabled={!ok}
        loading={del.isPending}
        onPress={() => del.mutate(undefined, { onSuccess: () => router.replace('/') })}
      />
      <Button label={t('common.cancel')} variant="ghost" onPress={() => router.back()} />
      <AppText variant="small" color={colors.text.secondary}>
        {t('account_delete.help')}
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  point: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
