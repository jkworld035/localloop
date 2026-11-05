import * as Location from 'expo-location';
import { Linking, Platform } from 'react-native';
import type { SelectedLocation } from '@/stores/location';

/**
 * Customer-side location: one accurate fix to discover nearby shops or set an
 * address. Partner tracking (continuous, background) lives in
 * services/partner-tracking.ts.
 */

export type LocationFailure = 'permission_denied' | 'services_off' | 'timeout' | 'unavailable';

export class LocationError extends Error {
  constructor(public readonly reason: LocationFailure) {
    super(reason);
  }
}

/** Accuracy worse than this is shown as "approximate" and the user is nudged to adjust the pin. */
export const LOW_ACCURACY_M = 100;

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new LocationError('timeout')), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function ensureForegroundPermission(): Promise<boolean> {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const res = await Location.requestForegroundPermissionsAsync();
  return res.granted;
}

/** Human-friendly label, e.g. "Vidyanagar, Kamareddy". Null if geocoding is unavailable (offline). */
export async function labelFor(latitude: number, longitude: number): Promise<string | null> {
  try {
    const [place] = await withTimeout(Location.reverseGeocodeAsync({ latitude, longitude }), 6000);
    if (!place) return null;
    const parts = [place.name && place.name !== place.street ? place.name : place.district, place.city ?? place.subregion]
      .filter((p): p is string => !!p && !/^\d+$/.test(p));
    return parts.length ? [...new Set(parts)].join(', ') : place.formattedAddress;
  } catch {
    return null;
  }
}

/**
 * Detects the device's actual position. Tries a high-accuracy fix first and
 * falls back to the OS's last known position only if it is recent (< 2 min);
 * the returned accuracy is always the fix's real accuracy.
 */
export async function detectCurrentLocation(): Promise<SelectedLocation> {
  if (!(await Location.hasServicesEnabledAsync())) throw new LocationError('services_off');
  if (!(await ensureForegroundPermission())) throw new LocationError('permission_denied');

  let fix: Location.LocationObject | null = null;
  try {
    fix = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High, mayShowUserSettingsDialog: true }),
      15000,
    );
  } catch (e) {
    const last = await Location.getLastKnownPositionAsync({ maxAge: 120_000, requiredAccuracy: 500 });
    if (!last) throw e instanceof LocationError ? e : new LocationError('unavailable');
    fix = last;
  }

  const { latitude, longitude, accuracy } = fix.coords;
  return {
    latitude,
    longitude,
    accuracyM: accuracy != null ? Math.round(accuracy) : null,
    label: await labelFor(latitude, longitude),
    source: 'gps',
    addressId: null,
    detectedAt: new Date(fix.timestamp).toISOString(),
  };
}

export function openLocationSettings() {
  if (Platform.OS === 'ios') void Linking.openURL('app-settings:');
  else void Linking.openSettings();
}
