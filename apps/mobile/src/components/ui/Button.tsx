import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, touchTarget } from '@localloop/shared';
import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps } from 'react-native';
import { AppText } from './AppText';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const palette: Record<Variant, { bg: string; fg: string; border: string; pressed: string }> = {
  primary: { bg: colors.brand.forest, fg: colors.text.onBrand, border: colors.brand.forest, pressed: colors.brand.green },
  secondary: { bg: colors.surface.card, fg: colors.brand.forest, border: colors.brand.forest, pressed: colors.surface.sunken },
  ghost: { bg: 'transparent', fg: colors.brand.forest, border: 'transparent', pressed: colors.surface.sunken },
  danger: { bg: colors.surface.card, fg: colors.status.danger, border: colors.status.danger, pressed: colors.status.dangerBg },
};

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: Variant;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  compact?: boolean;
}

export function Button({ label, variant = 'primary', loading = false, disabled, icon, compact, ...rest }: ButtonProps) {
  const p = palette[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: loading }}
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: compact ? touchTarget.min : touchTarget.comfortable,
          backgroundColor: pressed ? p.pressed : p.bg,
          borderColor: p.border,
          opacity: inactive && !loading ? 0.5 : 1,
        },
      ]}
      {...rest}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator color={p.fg} />
        ) : (
          icon && <Ionicons name={icon} size={20} color={p.fg} accessibilityElementsHidden />
        )}
        <AppText variant="bodyLarge" weight="medium" color={p.fg}>
          {label}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.md,
    borderWidth: 1.5,
    paddingHorizontal: spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
