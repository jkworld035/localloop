import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing } from '@localloop/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { BackRow } from '@/components/BackRow';
import { AppText, Button, Card, EmptyState, ErrorState, LoadingState, Screen } from '@/components/ui';
import { formatAddress, useAddresses, useDeleteAddress, useSetDefaultAddress } from '@/features/addresses/api';
import { errorMessage } from '@/lib/errors';
import { useCheckout } from '@/stores/checkout';

/** Saved addresses. With ?select=1 (from checkout), tapping one chooses it for this order. */
export default function Addresses() {
  const { t } = useTranslation();
  const { select } = useLocalSearchParams<{ select?: string }>();
  const selecting = select === '1';
  const addresses = useAddresses();
  const setDefault = useSetDefaultAddress();
  const remove = useDeleteAddress();
  const chosen = useCheckout((s) => s.addressId);
  const choose = useCheckout((s) => s.setAddress);

  return (
    <Screen
      edges={['top', 'bottom']}
      refreshing={addresses.isRefetching}
      onRefresh={() => void addresses.refetch()}
      footer={<Button label={t('address.add')} icon="add" onPress={() => router.push({ pathname: '/addresses/new', params: { select } })} />}
    >
      <BackRow title={t('address.title')} />
      {addresses.isPending ? (
        <LoadingState />
      ) : addresses.isError ? (
        <ErrorState error={addresses.error} onRetry={() => void addresses.refetch()} />
      ) : addresses.data.length === 0 ? (
        <EmptyState icon="home-outline" message={t('address.empty')} />
      ) : (
        addresses.data.map((a) => {
          const isChosen = selecting && chosen === a.id;
          return (
            <Card
              key={a.id}
              style={isChosen ? styles.chosen : undefined}
              onPress={
                selecting
                  ? () => {
                      choose(a.id);
                      router.back();
                    }
                  : undefined
              }
              accessibilityLabel={selecting ? `${t('address.select')}: ${a.label}, ${formatAddress(a)}` : undefined}
            >
              <View style={styles.row}>
                <Ionicons name={a.label.toLowerCase().includes('work') ? 'briefcase-outline' : 'home-outline'} size={22} color={colors.brand.forest} />
                <View style={styles.flex}>
                  <View style={styles.titleRow}>
                    <AppText weight="bold">{a.label}</AppText>
                    {a.is_default && (
                      <View style={styles.badge}>
                        <AppText variant="caption" weight="bold" color={colors.brand.forest}>
                          {t('address.default_badge')}
                        </AppText>
                      </View>
                    )}
                  </View>
                  <AppText color={colors.text.secondary}>{formatAddress(a)}</AppText>
                  <AppText variant="small" color={colors.text.secondary}>
                    {a.contact_name} · {a.contact_phone}
                  </AppText>
                </View>
                {isChosen && <Ionicons name="checkmark-circle" size={26} color={colors.brand.forest} />}
              </View>
              {!selecting && (
                <View style={styles.actions}>
                  {!a.is_default && (
                    <Pressable
                      accessibilityRole="button"
                      hitSlop={10}
                      onPress={() => setDefault.mutate(a.id, { onError: (e) => Alert.alert(errorMessage(e)) })}
                    >
                      <AppText weight="bold" color={colors.brand.forest}>
                        {t('address.set_default')}
                      </AppText>
                    </Pressable>
                  )}
                  <Pressable
                    accessibilityRole="button"
                    hitSlop={10}
                    onPress={() =>
                      Alert.alert(t('address.delete_confirm'), formatAddress(a), [
                        { text: t('common.cancel'), style: 'cancel' },
                        {
                          text: t('address.delete'),
                          style: 'destructive',
                          onPress: () => remove.mutate(a.id, { onError: (e) => Alert.alert(errorMessage(e)) }),
                        },
                      ])
                    }
                  >
                    <AppText weight="bold" color={colors.status.danger}>
                      {t('address.delete')}
                    </AppText>
                  </Pressable>
                </View>
              )}
            </Card>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  flex: { flex: 1, gap: spacing.xxs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badge: { backgroundColor: colors.status.successBg, paddingHorizontal: spacing.sm, borderRadius: radii.pill },
  actions: { flexDirection: 'row', gap: spacing.xl, justifyContent: 'flex-end', paddingTop: spacing.xs },
  chosen: { borderColor: colors.brand.forest, borderWidth: 2 },
});
