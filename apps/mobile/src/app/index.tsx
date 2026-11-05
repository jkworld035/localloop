import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, ErrorState, LoadingState, Screen } from '@/components/ui';
import { useProfile, useSignOut } from '@/features/account/api';
import { useSelectedLocation } from '@/stores/location';
import { usePreferences } from '@/stores/preferences';
import { useSession } from '@/stores/session';

/**
 * Entry gate. Every launch routes from here based on real state:
 * onboarding → sign-in → role choice → role home (customers also need a location).
 */
export default function Gate() {
  const { t } = useTranslation();
  const onboarded = usePreferences((s) => s.onboarded);
  const session = useSession((s) => s.session);
  const location = useSelectedLocation((s) => s.selected);
  const profile = useProfile();
  const signOut = useSignOut();

  if (!onboarded) return <Redirect href="/welcome" />;
  if (!session) return <Redirect href="/phone" />;
  if (profile.isPending) return <LoadingState />;
  if (profile.isError) {
    return (
      <Screen>
        <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />
        <Button label={t('common.sign_out')} variant="ghost" onPress={() => signOut.mutate()} />
      </Screen>
    );
  }

  switch (profile.data.role) {
    case null:
      return <Redirect href="/role" />;
    case 'customer':
      return <Redirect href={location ? '/home' : '/location'} />;
    case 'vendor':
      return <Redirect href="/vendor" />;
    case 'delivery_partner':
      return <Redirect href="/partner" />;
    case 'admin':
      return <Redirect href="/admin-notice" />;
  }
}
