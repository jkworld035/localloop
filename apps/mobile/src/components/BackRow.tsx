import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@localloop/shared';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './ui';

/** Top bar with a back button (falls back to Home when opened from a notification) and an optional title. */
export function BackRow({ title }: { title?: string }) {
  const { t } = useTranslation();
  return (
    <View style={styles.back}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
        hitSlop={8}
        style={styles.backButton}
      >
        <Ionicons name="arrow-back" size={26} color={colors.text.primary} />
      </Pressable>
      {title && (
        <AppText variant="title" weight="bold" accessibilityRole="header" style={styles.title} numberOfLines={1}>
          {title}
        </AppText>
      )}
    </View>
  );
}


const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm, minHeight: 52 },
  backButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1 },
});
