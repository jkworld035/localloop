import { colors } from '@localloop/shared';
import { useTranslation } from 'react-i18next';
import { AppText, Banner, Screen } from '@/components/ui';
import { AccountSettings } from '@/features/account/AccountSettings';

/** Admin accounts operate from the web dashboard; the mobile app has no admin surface by design. */
export default function AdminNotice() {
  const { t } = useTranslation();
  return (
    <Screen edges={['top', 'bottom']}>
      <AppText variant="heading" weight="bold" accessibilityRole="header">
        {t('common.app_name')} Admin
      </AppText>
      <Banner tone="info" message="This is an administrator account. Please use the LocalLoop admin dashboard on the web." />
      <AppText color={colors.text.secondary}>{t('profile.title')}</AppText>
      <AccountSettings />
    </Screen>
  );
}
