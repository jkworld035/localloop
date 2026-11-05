import { colors, spacing } from '@localloop/shared';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { missingEnv } from '@/lib/env';
import { AppText, Banner } from './ui';

/**
 * Developer-facing screen shown when the build has no backend configured.
 * The app never falls back to fake data.
 */
export function ConfigMissing() {
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.body}>
        <AppText variant="heading" weight="bold">
          LocalLoop isn't configured
        </AppText>
        <Banner
          tone="danger"
          message={`Missing: ${missingEnv.join(', ')}. Copy apps/mobile/.env.example to .env (or set EAS environment variables) and rebuild.`}
        />
        <AppText color={colors.text.secondary}>See docs/setup.md → "Mobile app".</AppText>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.background },
  body: { padding: spacing.xl, gap: spacing.lg },
});
