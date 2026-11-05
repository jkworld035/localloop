import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@localloop/shared';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { errorMessage } from '@/lib/errors';
import { AppText } from './AppText';
import { Button } from './Button';

export function LoadingState({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <View style={styles.center} accessibilityRole="progressbar" accessibilityLabel={label ?? t('common.loading')}>
      <ActivityIndicator size="large" color={colors.brand.forest} />
      <AppText color={colors.text.secondary}>{label ?? t('common.loading')}</AppText>
    </View>
  );
}

export function EmptyState({
  icon = 'storefront-outline',
  message,
  actionLabel,
  onAction,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.center}>
      <Ionicons name={icon} size={48} color={colors.text.muted} accessibilityElementsHidden />
      <AppText align="center" color={colors.text.secondary}>
        {message}
      </AppText>
      {actionLabel && onAction && <Button label={actionLabel} variant="secondary" onPress={onAction} />}
    </View>
  );
}

/** Every failed load ends here — never an endless spinner. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.center} accessibilityRole="alert">
      <Ionicons name="cloud-offline-outline" size={48} color={colors.status.danger} accessibilityElementsHidden />
      <AppText align="center">{errorMessage(error)}</AppText>
      {onRetry && <Button label={t('common.retry')} variant="secondary" icon="refresh" onPress={onRetry} />}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl, minHeight: 240 },
});
