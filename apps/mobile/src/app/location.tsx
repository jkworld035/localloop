import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@localloop/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { AppText, Banner, Button, Card, Screen } from '@/components/ui';
import { useAreaStatus } from '@/features/discovery/api';
import { detectCurrentLocation, LocationError, LOW_ACCURACY_M, openLocationSettings, type LocationFailure } from '@/services/location';
import { useSelectedLocation, type SelectedLocation } from '@/stores/location';

export default function LocationScreen() {
  const { t } = useTranslation();
  const select = useSelectedLocation((s) => s.select);
  const [detecting, setDetecting] = useState(false);
  const [failure, setFailure] = useState<LocationFailure | null>(null);
  const [found, setFound] = useState<SelectedLocation | null>(null);
  const area = useAreaStatus(found);

  const detect = async () => {
    setDetecting(true);
    setFailure(null);
    try {
      setFound(await detectCurrentLocation());
    } catch (e) {
      setFailure(e instanceof LocationError ? e.reason : 'unavailable');
    } finally {
      setDetecting(false);
    }
  };

  const confirm = () => {
    if (!found) return;
    select(found);
    router.replace('/home');
  };

  const failureMessage: Record<LocationFailure, string> = {
    permission_denied: t('location.permission_denied'),
    services_off: t('location.services_off'),
    timeout: t('location.timeout'),
    unavailable: t('location.timeout'),
  };

  return (
    <Screen
      edges={['top', 'bottom']}
      footer={
        found ? (
          <>
            <Button label={t('common.continue')} onPress={confirm} />
            <Button
              label={t('location.choose_on_map')}
              variant="ghost"
              icon="map-outline"
              onPress={() => router.push({ pathname: '/location-map', params: { lat: found.latitude, lng: found.longitude } })}
            />
          </>
        ) : (
          <>
            <Button label={t('location.use_current')} icon="navigate" loading={detecting} onPress={detect} />
            <Button label={t('location.choose_on_map')} variant="secondary" icon="map-outline" onPress={() => router.push('/location-map')} />
          </>
        )
      }
    >
      <AppText variant="heading" weight="bold" accessibilityRole="header">
        {t('location.title')}
      </AppText>
      <AppText color={colors.text.secondary}>{t('location.subtitle')}</AppText>

      {detecting && (
        <Banner tone="info" message={t('location.detecting')} />
      )}

      {failure && (
        <Banner
          tone="warning"
          message={failureMessage[failure]}
          actionLabel={failure === 'permission_denied' || failure === 'services_off' ? t('location.open_settings') : t('common.retry')}
          onAction={failure === 'permission_denied' || failure === 'services_off' ? openLocationSettings : detect}
        />
      )}

      {found && (
        <Card>
          <View style={styles.row}>
            <Ionicons name="location" size={28} color={colors.brand.forest} accessibilityElementsHidden />
            <View style={styles.flex}>
              <AppText variant="title" weight="bold">
                {found.label ?? t('location.current')}
              </AppText>
              {found.accuracyM != null && (
                <AppText variant="small" color={colors.text.secondary}>
                  {t('location.accuracy', { meters: found.accuracyM })}
                </AppText>
              )}
            </View>
          </View>
          {found.accuracyM != null && found.accuracyM > LOW_ACCURACY_M && (
            <Banner tone="warning" message={t('location.low_accuracy', { meters: found.accuracyM })} />
          )}
          {area.data &&
            (area.data.serviceable ? (
              <Banner tone="success" message={t('location.serviceable', { area: area.data.area_name })} />
            ) : (
              <Banner tone="info" message={t('location.not_serviceable')} />
            ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  flex: { flex: 1, gap: spacing.xxs },
});
