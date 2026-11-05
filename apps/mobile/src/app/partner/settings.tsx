import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AppText, Button, Screen } from '@/components/ui';
import { AccountSettings } from '@/features/account/AccountSettings';

export default function PartnerSettings() {
  const { t } = useTranslation();
  return (
    <Screen edges={['top', 'bottom']}>
      <Button label={t('common.back')} variant="ghost" icon="arrow-back" compact onPress={() => router.back()} />
      <AppText variant="heading" weight="bold" accessibilityRole="header">
        {t('profile.title')}
      </AppText>
      <AccountSettings />
    </Screen>
  );
}
