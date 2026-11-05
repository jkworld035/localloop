import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, touchTarget } from '@localloop/shared';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui';

/**
 * "Add" button that becomes − qty + once the item is in the cart.
 * 48pt targets; the count is announced as an adjustable value.
 */
export function QuantityStepper({
  quantity,
  max,
  busy,
  disabled,
  onChange,
  itemName,
}: {
  quantity: number;
  max: number | null;
  busy?: boolean;
  disabled?: boolean;
  onChange: (next: number) => void;
  itemName: string;
}) {
  const { t } = useTranslation();
  const atMax = max !== null && quantity >= max;

  if (quantity === 0) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('shop.add')} ${itemName}`}
        accessibilityState={{ disabled: !!disabled || !!busy, busy: !!busy }}
        disabled={disabled || busy}
        onPress={() => onChange(1)}
        style={({ pressed }) => [styles.add, pressed && styles.addPressed, disabled && styles.disabled]}
      >
        {busy ? (
          <ActivityIndicator color={colors.brand.forest} />
        ) : (
          <AppText weight="bold" color={colors.brand.forest}>
            {t('shop.add')}
          </AppText>
        )}
      </Pressable>
    );
  }

  return (
    <View
      style={styles.stepper}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`${itemName}, ${t('cart.quantity_label', { count: quantity })}`}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment' && !atMax) onChange(quantity + 1);
        if (e.nativeEvent.actionName === 'decrement') onChange(quantity - 1);
      }}
    >
      <Pressable
        accessibilityLabel={t('cart.decrease')}
        disabled={busy}
        onPress={() => onChange(quantity - 1)}
        hitSlop={6}
        style={styles.button}
      >
        <Ionicons name={quantity === 1 ? 'trash-outline' : 'remove'} size={20} color={colors.text.onBrand} />
      </Pressable>
      <View style={styles.count}>
        {busy ? (
          <ActivityIndicator color={colors.text.onBrand} size="small" />
        ) : (
          <AppText weight="bold" color={colors.text.onBrand}>
            {quantity}
          </AppText>
        )}
      </View>
      <Pressable
        accessibilityLabel={t('cart.increase')}
        disabled={busy || atMax}
        onPress={() => onChange(quantity + 1)}
        hitSlop={6}
        style={[styles.button, atMax && styles.disabled]}
      >
        <Ionicons name="add" size={20} color={colors.text.onBrand} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  add: {
    minWidth: 96,
    minHeight: touchTarget.min,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.brand.forest,
    backgroundColor: colors.surface.card,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  addPressed: { backgroundColor: colors.surface.sunken },
  stepper: {
    minWidth: 112,
    minHeight: touchTarget.min,
    borderRadius: radii.md,
    backgroundColor: colors.brand.forest,
    flexDirection: 'row',
    alignItems: 'center',
  },
  button: { width: 40, height: touchTarget.min, alignItems: 'center', justifyContent: 'center' },
  count: { flex: 1, alignItems: 'center' },
  disabled: { opacity: 0.4 },
});
