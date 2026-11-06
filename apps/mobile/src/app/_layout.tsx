// Side-effect imports first: i18n must exist before any screen renders, and the
// background location task must be defined at startup so the OS can wake it.
import '@/lib/i18n';
import '@/services/partner-tracking';
import { installCrashReporting, reportError, setCurrentScreen } from '@/services/crashReporting';

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
import { SplashScreen, Stack, usePathname, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
installCrashReporting();

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
          <ScreenTracker />
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

/** Remembers the current route so crash reports say where they happened. */
function ScreenTracker() {
  const path = usePathname();
  useEffect(() => setCurrentScreen(path), [path]);
  return null;
}

/**
 * Last-resort screen when a render crashes: reports it and offers a retry
 * instead of a blank app. (Expo Router uses this export for the whole tree.)
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => reportError(error, true), [error]);
  return (
    <View style={crash.root}>
      <Text style={crash.title} accessibilityRole="header">
        {i18n.t('errors.crash_title')}
      </Text>
      <Text style={crash.body}>{i18n.t('errors.crash_body')}</Text>
      <Pressable accessibilityRole="button" onPress={() => void retry()} style={crash.button}>
        <Text style={crash.buttonText}>{i18n.t('common.retry')}</Text>
      </Pressable>
    </View>
  );
}

const crash = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16, backgroundColor: colors.surface.background },
  title: { fontSize: 22, fontWeight: '700', color: colors.text.primary, textAlign: 'center' },
  body: { fontSize: 16, color: colors.text.secondary, textAlign: 'center' },
  button: { minHeight: 52, minWidth: 160, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand.forest, paddingHorizontal: 24 },
  buttonText: { fontSize: 17, fontWeight: '700', color: colors.text.onBrand },
});
