import { colors, radii, spacing, type OrderStatus } from '@localloop/shared';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui';

const tone: Record<OrderStatus, { fg: string; bg: string }> = {
  placed: { fg: colors.status.info, bg: colors.status.infoBg },
  accepted: { fg: colors.status.info, bg: colors.status.infoBg },
  preparing: { fg: colors.status.warning, bg: colors.status.warningBg },
  ready_for_pickup: { fg: colors.status.warning, bg: colors.status.warningBg },
  picked_up: { fg: colors.brand.forest, bg: colors.status.successBg },
  delivered: { fg: colors.status.success, bg: colors.status.successBg },
  rejected: { fg: colors.status.danger, bg: colors.status.dangerBg },
  cancelled: { fg: colors.status.danger, bg: colors.status.dangerBg },
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useTranslation();
  const s = tone[status];
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <AppText variant="caption" weight="bold" color={s.fg}>
        {t(`order_status.${status}`)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs, borderRadius: radii.pill },
});
