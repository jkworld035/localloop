import { colors, LEGAL_DOCS, spacing, type LegalDocId } from '@localloop/shared';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { BackRow } from '@/components/BackRow';
import { AppText, Banner, EmptyState, Screen } from '@/components/ui';

/** Terms, privacy and refund policy. The same text is published on the web for the app stores. */
export default function LegalScreen() {
  const { t, i18n } = useTranslation();
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const d = LEGAL_DOCS[doc as LegalDocId];
  if (!d)
    return (
      <Screen edges={['top', 'bottom']}>
        <BackRow />
        <EmptyState message={t('errors.generic')} />
      </Screen>
    );
  return (
    <Screen edges={['top', 'bottom']}>
      <BackRow title={d.title} />
      {i18n.language === 'te' && <Banner tone="info" message={t('legal.english_only')} />}
      <AppText color={colors.text.secondary}>{d.summary}</AppText>
      {d.sections.map((s) => (
        <View key={s.heading} style={styles.section}>
          <AppText variant="title" weight="bold" accessibilityRole="header">
            {s.heading}
          </AppText>
          {s.paragraphs.map((p, i) => (
            <AppText key={i}>{p}</AppText>
          ))}
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
});
