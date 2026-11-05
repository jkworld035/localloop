import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing } from '@localloop/shared';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';

type Tone = 'info' | 'success' | 'warning' | 'danger';

const toneStyle: Record<Tone, { fg: string; bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  info: { fg: colors.status.info, bg: colors.status.infoBg, icon: 'information-circle' },
  success: { fg: colors.status.success, bg: colors.status.successBg, icon: 'checkmark-circle' },
  warning: { fg: colors.status.warning, bg: colors.status.warningBg, icon: 'warning' },
  danger: { fg: colors.status.danger, bg: colors.status.dangerBg, icon: 'alert-circle' },
};

export interface BannerProps {
  tone?: Tone;
  title?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** Inline status message. Uses an icon + text (never colour alone) and is announced by screen readers. */
export function Banner({ tone = 'info', title, message, actionLabel, onAction }: BannerProps) {
  const s = toneStyle[tone];
  return (
    <View
      style={[styles.root, { backgroundColor: s.bg }]}
      accessibilityRole={tone === 'danger' ? 'alert' : 'summary'}
      accessibilityLiveRegion="polite"
    >
      <Ionicons name={s.icon} size={22} color={s.fg} accessibilityElementsHidden />
      <View style={styles.body}>
        {title && (
          <AppText weight="bold" color={s.fg}>
            {title}
          </AppText>
        )}
        <AppText variant="small" color={colors.text.primary}>
          {message}
        </AppText>
        {actionLabel && onAction && (
          <Pressable accessibilityRole="button" onPress={onAction} hitSlop={12} style={styles.action}>
            <AppText variant="small" weight="bold" color={s.fg}>
              {actionLabel}
            </AppText>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, borderRadius: radii.md, alignItems: 'flex-start' },
  body: { flex: 1, gap: spacing.xs },
  action: { alignSelf: 'flex-start', paddingVertical: spacing.xs },
});
