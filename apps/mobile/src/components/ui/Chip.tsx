import { colors, radii, spacing, touchTarget } from '@localloop/shared';
import { Pressable, StyleSheet } from 'react-native';
import { AppText } from './AppText';

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.selected,
        pressed && !selected && { backgroundColor: colors.surface.sunken },
      ]}
    >
      <AppText variant="small" weight="medium" color={selected ? colors.text.onBrand : colors.text.primary}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: touchTarget.min - 8,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.surface.borderStrong,
    backgroundColor: colors.surface.card,
    justifyContent: 'center',
  },
  selected: { backgroundColor: colors.brand.forest, borderColor: colors.brand.forest },
});
