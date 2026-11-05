import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing } from '@localloop/shared';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, Button, Screen } from '@/components/ui';
import { useSetLanguage } from '@/features/account/api';
import { LANGUAGES, type AppLanguage } from '@/lib/i18n';
import { usePreferences } from '@/stores/preferences';

export default function Welcome() {
  const { t, i18n } = useTranslation();
  const setLanguage = useSetLanguage();
  const completeOnboarding = usePreferences((s) => s.completeOnboarding);
  const current = i18n.language as AppLanguage;

  return (
    <Screen
      edges={['top', 'bottom']}
      footer={
        <Button
          label={t('onboarding.get_started')}
          onPress={() => {
            if (!usePreferences.getState().language) setLanguage.mutate(current);
            completeOnboarding();
            router.replace('/phone');
          }}
        />
      }
    >
      <View style={styles.hero}>
        <View style={styles.logo} accessibilityElementsHidden>
          <Ionicons name="location" size={44} color={colors.brand.amber} />
        </View>
        <AppText variant="display" weight="bold" color={colors.brand.forest}>
          {t('common.app_name')}
        </AppText>
        <AppText variant="heading" weight="bold">
          {t('onboarding.title')}
        </AppText>
        <AppText variant="bodyLarge" color={colors.text.secondary}>
          {t('onboarding.subtitle')}
        </AppText>
      </View>

      <View style={styles.languages} accessibilityRole="radiogroup" accessibilityLabel={t('onboarding.choose_language')}>
        <AppText weight="medium">{t('onboarding.choose_language')}</AppText>
        {LANGUAGES.map((lang) => {
          const selected = current === lang;
          return (
            <Pressable
              key={lang}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => setLanguage.mutate(lang)}
              style={[styles.option, selected && styles.optionSelected]}
            >
              <AppText variant="title" weight={selected ? 'bold' : 'regular'}>
                {t(`language.${lang}`)}
              </AppText>
              <Ionicons
                name={selected ? 'radio-button-on' : 'radio-button-off'}
                size={26}
                color={selected ? colors.brand.forest : colors.text.muted}
              />
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: spacing.md, paddingTop: spacing.xxl },
  logo: {
    width: 72,
    height: 72,
    borderRadius: radii.lg,
    backgroundColor: colors.brand.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  languages: { gap: spacing.md, marginTop: spacing.xl },
  option: {
    minHeight: 64,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.surface.borderStrong,
    backgroundColor: colors.surface.card,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionSelected: { borderColor: colors.brand.forest, borderWidth: 2 },
});
