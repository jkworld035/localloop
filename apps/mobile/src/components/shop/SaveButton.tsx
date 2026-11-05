import { Ionicons } from '@expo/vector-icons';
import { colors, touchTarget } from '@localloop/shared';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';
import { useSavedEntry, useToggleSaved } from '@/features/wishlist/api';

/** Heart toggle for saving a shop or product to the wishlist. */
export function SaveButton({ productId, storeId, name }: { productId?: string; storeId?: string; name: string }) {
  const { t } = useTranslation();
  const target = productId ? { productId } : { storeId: storeId! };
  const saved = !!useSavedEntry(target);
  const toggle = useToggleSaved(target);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${saved ? t('shop.unsave') : t('shop.save')}: ${name}`}
      accessibilityState={{ selected: saved, busy: toggle.isPending }}
      disabled={toggle.isPending}
      onPress={() => toggle.mutate()}
      hitSlop={8}
      style={{ minWidth: touchTarget.min, minHeight: touchTarget.min, alignItems: 'center', justifyContent: 'center' }}
    >
      <Ionicons name={saved ? 'heart' : 'heart-outline'} size={26} color={saved ? colors.status.danger : colors.text.primary} />
    </Pressable>
  );
}
