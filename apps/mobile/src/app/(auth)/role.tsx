import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, type SelfSelectableRole } from '@localloop/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { AppText, Banner, Button, Card, Screen } from '@/components/ui';
import { useChooseRole } from '@/features/account/api';
import { errorMessage } from '@/lib/errors';

const OPTIONS: { role: SelfSelectableRole; icon: keyof typeof Ionicons.glyphMap }[] = [
  { role: 'customer', icon: 'basket-outline' },
  { role: 'vendor', icon: 'storefront-outline' },
  { role: 'delivery_partner', icon: 'bicycle-outline' },
];

export default function RoleChoice() {
  const { t } = useTranslation();
  const [role, setRole] = useState<SelfSelectableRole | null>(null);
  const choose = useChooseRole();

  return (
    <Screen
      edges={['top', 'bottom']}
      footer={
        <Button
          label={t('common.continue')}
          disabled={!role}
          loading={choose.isPending}
          onPress={() => role && choose.mutate(role, { onSuccess: () => router.replace('/') })}
        />
      }
    >
      <AppText variant="heading" weight="bold" accessibilityRole="header">
        {t('roles.title')}
      </AppText>
      <AppText color={colors.text.secondary}>{t('roles.subtitle')}</AppText>
      <View style={styles.list} accessibilityRole="radiogroup">
        {OPTIONS.map((o) => {
          const selected = role === o.role;
          return (
            <Card
              key={o.role}
              onPress={() => setRole(o.role)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              style={selected ? styles.selected : undefined}
            >
              <View style={styles.row}>
                <Ionicons name={o.icon} size={32} color={colors.brand.forest} accessibilityElementsHidden />
                <View style={styles.text}>
                  <AppText variant="title" weight="bold">
                    {t(`roles.${o.role}`)}
                  </AppText>
                  <AppText color={colors.text.secondary}>{t(`roles.${o.role}_hint`)}</AppText>
                </View>
                <Ionicons
                  name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                  size={26}
                  color={selected ? colors.brand.forest : colors.text.muted}
                />
              </View>
            </Card>
          );
        })}
      </View>
      {choose.isError && <Banner tone="danger" message={errorMessage(choose.error)} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  text: { flex: 1, gap: spacing.xs },
  selected: { borderColor: colors.brand.forest, borderWidth: 2 },
});
