import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@localloop/shared';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { AppText, Banner, Button, Card, Chip } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { LANGUAGES } from '@/lib/i18n';
import { useProfile, useSetLanguage, useSignOut } from './api';

/** Profile & settings block shared by all three role experiences. */
export function AccountSettings({ showLocation }: { showLocation?: boolean }) {
  const { t, i18n } = useTranslation();
  const profile = useProfile();
  const setLanguage = useSetLanguage();
  const signOut = useSignOut();

  return (
    <View style={styles.root}>
      <Card>
        <View style={styles.row}>
          <Ionicons name="person-circle-outline" size={44} color={colors.brand.forest} accessibilityElementsHidden />
          <View style={styles.flex}>
            <AppText variant="title" weight="bold">
              {profile.data?.full_name ?? '—'}
            </AppText>
            <AppText color={colors.text.secondary}>{profile.data?.phone ?? ''}</AppText>
            {profile.data?.role && (
              <AppText variant="small" color={colors.text.secondary}>
                {t(`profile.role_${profile.data.role === 'admin' ? 'customer' : profile.data.role}`)}
              </AppText>
            )}
          </View>
        </View>
      </Card>

      <Card>
        <AppText weight="medium">{t('profile.language')}</AppText>
        <View style={styles.chips}>
          {LANGUAGES.map((l) => (
            <Chip key={l} label={t(`language.${l}`)} selected={i18n.language === l} onPress={() => setLanguage.mutate(l)} />
          ))}
        </View>
        {setLanguage.isError && <Banner tone="danger" message={errorMessage(setLanguage.error)} />}
      </Card>

      {showLocation && (
        <>
          <Button label={t('address.title')} variant="secondary" icon="home-outline" onPress={() => router.push('/addresses')} />
          <Button label={t('location.title')} variant="secondary" icon="location-outline" onPress={() => router.push('/location')} />
        </>
      )}

      <Button label={t('notifications.title')} variant="secondary" icon="notifications-outline" onPress={() => router.push('/notifications')} />
      <Button label={t('support.title')} variant="secondary" icon="chatbubbles-outline" onPress={() => router.push('/support')} />

      <Card>
        <AppText weight="medium">{t('legal.title')}</AppText>
        {(['terms', 'privacy', 'refunds'] as const).map((doc) => (
          <Button key={doc} label={t(`legal.${doc}`)} variant="ghost" compact onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc } })} />
        ))}
        <AppText variant="caption" color={colors.text.secondary}>
          {t('legal.version', { version: Constants.expoConfig?.version ?? '' })}
        </AppText>
      </Card>

      <Button label={t('common.sign_out')} variant="danger" icon="log-out-outline" loading={signOut.isPending} onPress={() => signOut.mutate()} />
      {signOut.isError && <Banner tone="danger" message={errorMessage(signOut.error)} />}
      <Button label={t('account_delete.title')} variant="ghost" compact icon="trash-outline" onPress={() => router.push('/account/delete')} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.lg },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', gap: spacing.sm },
});
