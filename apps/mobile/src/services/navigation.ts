import { Linking, Platform } from 'react-native';

/**
 * Opens turn-by-turn navigation in the phone's maps app. On Android this goes
 * straight into Google Maps navigation (two-wheeler mode where available); on
 * iOS, or if Google Maps isn't installed, it opens directions in the browser
 * or Apple Maps.
 */
export async function openNavigation(to: { latitude: number; longitude: number }, vehicle: string) {
  const dest = `${to.latitude},${to.longitude}`;
  const twoWheeler = vehicle === 'scooter' || vehicle === 'motorcycle';
  const mode = vehicle === 'bicycle' ? 'b' : twoWheeler ? 'l' : 'd';
  const candidates =
    Platform.OS === 'android'
      ? [`google.navigation:q=${dest}&mode=${mode}`]
      : [`comgooglemaps://?daddr=${dest}&directionsmode=${vehicle === 'bicycle' ? 'bicycling' : 'driving'}`, `maps://?daddr=${dest}`];
  for (const url of candidates) {
    if (await Linking.canOpenURL(url).catch(() => false)) return Linking.openURL(url);
  }
  const travelmode = vehicle === 'bicycle' ? 'bicycling' : twoWheeler ? 'two-wheeler' : 'driving';
  return Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=${travelmode}`);
}

export function callNumber(phone: string) {
  return Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`);
}
