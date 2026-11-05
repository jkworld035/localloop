import { colors, spacing } from '@localloop/shared';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Switch, View } from 'react-native';
import { AppText, Card } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { useUpdateStore, type Store } from './api';

/** The vendor's own pause switch (e.g. rush hour, out for lunch). Independent of opening hours. */
export function AcceptingSwitch({ store }: { store: Store }) {
  const { t } = useTranslation();
  const update = useUpdateStore();
  const on = store.is_accepting_orders;
  return (
    <Card style={on ? undefined : styles.paused}>
      <View style={styles.row}>
        <View style={styles.flex}>
          <AppText variant="title" weight="bold">
            {on ? t('vendor.accepting_on') : t('vendor.accepting_off')}
          </AppText>
          <AppText variant="small" color={colors.text.secondary}>
            {on ? t('vendor.accepting_on_hint') : t('vendor.accepting_off_hint')}
          </AppText>
        </View>
        <Switch
          accessibilityLabel={t('vendor.accepting_label')}
          value={on}
          disabled={update.isPending}
          trackColor={{ true: colors.brand.green, false: colors.surface.borderStrong }}
          thumbColor={colors.surface.card}
          onValueChange={(v) =>
            update.mutate({ id: store.id, values: { is_accepting_orders: v } }, { onError: (e) => Alert.alert(errorMessage(e)) })
          }
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1, gap: spacing.xxs },
  paused: { borderColor: colors.brand.amber, borderWidth: 2 },
});
