import { colors, elevation, radii, spacing } from '@localloop/shared';
import { Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

export interface CardProps extends Omit<PressableProps, 'style' | 'children'> {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Rounded surface. Becomes a button (with pressed state) when given onPress. */
export function Card({ children, style, onPress, ...rest }: CardProps) {
  if (!onPress) return <View style={[styles.card, style]}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}
      {...rest}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface.card,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface.border,
    ...elevation.card,
  },
  pressed: { backgroundColor: colors.surface.sunken },
});
