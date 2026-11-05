import { useTranslation } from 'react-i18next';
import { AppText, Screen } from '@/components/ui';
import { AccountSettings } from '@/features/account/AccountSettings';

export default function VendorSettings() {
  const { t } = useTranslation();
  return (
    <Screen>
      <AppText variant="heading" weight="bold" accessibilityRole="header">
        {t('profile.title')}
      </AppText>
      <AccountSettings />
    </Screen>
  );
}
