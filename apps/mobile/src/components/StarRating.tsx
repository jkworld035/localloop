import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@localloop/shared';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

/** 1–5 star picker. Each star is a 48 dp target and announces "n of 5". */
export function StarRating({ value, onChange, label, size = 36 }: { value: number; onChange?: (v: number) => void; label: string; size?: number }) {
  const { t } = useTranslation();
  return (
    <View
      style={styles.row}
      // Read-only stars are one image; interactive stars are five separate buttons.
      accessible={!onChange}
      accessibilityRole={onChange ? undefined : 'image'}
      accessibilityLabel={onChange ? undefined : `${label}: ${t('reviews.stars', { count: value })}`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          disabled={!onChange}
          onPress={() => onChange?.(n)}
          hitSlop={4}
          style={styles.star}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${t('reviews.stars', { count: n })}`}
          accessibilityState={{ selected: n <= value }}
        >
          <Ionicons name={n <= value ? 'star' : 'star-outline'} size={size} color={n <= value ? colors.brand.amber : colors.text.muted} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.xs },
  star: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
