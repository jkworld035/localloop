// Side-effect imports first: i18n must exist before any screen renders, and the
// background location task must be defined at startup so the OS can wake it.
import '@/lib/i18n';
import '@/services/partner-tracking';

import {
  NotoSans_400Regular,
  NotoSans_500Medium,
  NotoSans_700Bold,
} from '@expo-google-fonts/noto-sans';
import {
  NotoSansTelugu_400Regular,
  NotoSansTelugu_500Medium,
  NotoSansTelugu_700Bold,
} from '@expo-google-fonts/noto-sans-telugu';
import { colors, typography } from '@localloop/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { getLocales } from 'expo-localization';
import { SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConfigMissing } from '@/components/ConfigMissing';
import { PushRegistrar } from '@/components/PushRegistrar';
import { isConfigured } from '@/lib/env';
import i18n from '@/lib/i18n';
import { queryClient } from '@/lib/query';
import { useSelectedLocation } from '@/stores/location';
import { usePreferences } from '@/stores/preferences';
import { startSessionListener, useSession } from '@/stores/session';

void SplashScreen.preventAutoHideAsync();
startSessionListener();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    [typography.family.latin]: NotoSans_400Regular,
    [typography.family.latinMedium]: NotoSans_500Medium,
    [typography.family.latinBold]: NotoSans_700Bold,
    [typography.family.telugu]: NotoSansTelugu_400Regular,
    [typography.family.teluguMedium]: NotoSansTelugu_500Medium,
    [typography.family.teluguBold]: NotoSansTelugu_700Bold,
  });
  const prefsHydrated = usePreferences((s) => s.hydrated);
  const language = usePreferences((s) => s.language);
  const locationHydrated = useSelectedLocation((s) => s.hydrated);
  const sessionReady = useSession((s) => s.ready);
  const [languageApplied, setLanguageApplied] = useState(false);

  // Apply the saved language, or the device language on first launch.
  useEffect(() => {
    if (!prefsHydrated) return;
    const deviceTelugu = getLocales().some((l) => l.languageCode === 'te');
    void i18n.changeLanguage(language ?? (deviceTelugu ? 'te' : 'en')).then(() => setLanguageApplied(true));
  }, [prefsHydrated, language]);

  // Font failure is not fatal: system fonts still render both scripts.
  const ready = (fontsLoaded || !!fontError) && languageApplied && locationHydrated && (sessionReady || !isConfigured);

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;
  if (!isConfigured) return <ConfigMissing />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="dark" />
          <PushRegistrar />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.surface.background },
              animation: 'slide_from_right',
            }}
          />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
