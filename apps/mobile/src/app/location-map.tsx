import { Ionicons } from '@expo/vector-icons';
import { colors, elevation, INDIA_BOUNDS, LAUNCH_MAP_REGION, radii, spacing } from '@localloop/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import MapView, { PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Banner, Button } from '@/components/ui';
import { labelFor } from '@/services/location';
import { useAddressDraft } from '@/stores/checkout';
import { useSelectedLocation } from '@/stores/location';

/**
 * Manual location: the user drags the map under a fixed centre pin. Works
 * with location permission denied. Opens on the detected position when there
 * is one, otherwise on the launch market purely as a starting viewport.
 */
export default function LocationMap() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ lat?: string; lng?: string; purpose?: string }>();
  const setAddressPoint = useAddressDraft((s) => s.setPoint);
  const select = useSelectedLocation((s) => s.select);
  const start =
    params.lat && params.lng
      ? { latitude: Number(params.lat), longitude: Number(params.lng), latitudeDelta: 0.005, longitudeDelta: 0.005 }
      : LAUNCH_MAP_REGION;
  const [center, setCenter] = useState<Region>(start);
  const [saving, setSaving] = useState(false);
  const inIndia =
    center.latitude >= INDIA_BOUNDS.minLat &&
    center.latitude <= INDIA_BOUNDS.maxLat &&
    center.longitude >= INDIA_BOUNDS.minLng &&
    center.longitude <= INDIA_BOUNDS.maxLng;

  const confirm = async () => {
    // Placing the pin for a new delivery address: hand the point back to the form.
    if (params.purpose === 'address') {
      setAddressPoint({ latitude: center.latitude, longitude: center.longitude });
      router.back();
      return;
    }
    setSaving(true);
    select({
      latitude: center.latitude,
      longitude: center.longitude,
      label: await labelFor(center.latitude, center.longitude),
      source: 'map',
      accuracyM: null,
      addressId: null,
      detectedAt: new Date().toISOString(),
    });
    setSaving(false);
    router.dismissAll();
    router.replace('/home');
  };

  return (
    <View style={styles.root}>
      <MapView
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_GOOGLE}
        initialRegion={start}
        onRegionChangeComplete={setCenter}
        showsUserLocation
        showsMyLocationButton
        toolbarEnabled={false}
        accessibilityLabel={t('location.move_pin')}
      />
      {/* Fixed centre pin; the map moves beneath it. */}
      <View pointerEvents="none" style={styles.pinWrap}>
        <Ionicons name="location-sharp" size={48} color={colors.brand.forest} />
      </View>
      <SafeAreaView edges={['top']} style={styles.top} pointerEvents="box-none">
        <View style={styles.hint}>
          <AppText variant="small" weight="medium">
            {t('location.move_pin')}
          </AppText>
        </View>
      </SafeAreaView>
      <SafeAreaView edges={['bottom']} style={styles.bottom}>
        {!inIndia && <Banner tone="warning" message={t('validation.location_outside_india')} />}
        <Button label={t('location.confirm_pin')} disabled={!inIndia} loading={saving} onPress={confirm} />
        <Button label={t('common.back')} variant="ghost" compact onPress={() => router.back()} />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.background },
  pinWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingBottom: 48 },
  top: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' },
  hint: {
    marginTop: spacing.md,
    backgroundColor: colors.surface.card,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    ...elevation.card,
  },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    gap: spacing.sm,
    backgroundColor: colors.surface.card,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    ...elevation.raised,
  },
});
