import type { LatLng } from '../validation/common';

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (d: number) => (d * Math.PI) / 180;

/**
 * Great-circle distance. Used ONLY for client-side decisions (marker
 * animation, "has the driver moved enough to bother the server"). It is never
 * shown to customers as delivery distance or used to compute ETA — those come
 * from the routing provider's road distance.
 */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Decode a Google encoded polyline (Routes API `polyline.encodedPolyline`). */
export function decodePolyline(encoded: string, precision = 5): LatLng[] {
  const factor = 10 ** precision;
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const next = (): number => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= encoded.length) throw new Error('Malformed polyline');
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    lat += next();
    lng += next();
    points.push({ latitude: lat / factor, longitude: lng / factor });
  }
  return points;
}

/** Linear interpolation between two fixes — drives smooth marker movement. */
export function interpolate(a: LatLng, b: LatLng, t: number): LatLng {
  const k = Math.min(1, Math.max(0, t));
  return { latitude: a.latitude + (b.latitude - a.latitude) * k, longitude: a.longitude + (b.longitude - a.longitude) * k };
}

/** Initial compass bearing a → b in degrees, for rotating the partner marker. */
export function bearingDegrees(a: LatLng, b: LatLng): number {
  const y = Math.sin(toRad(b.longitude - a.longitude)) * Math.cos(toRad(b.latitude));
  const x =
    Math.cos(toRad(a.latitude)) * Math.sin(toRad(b.latitude)) -
    Math.sin(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.cos(toRad(b.longitude - a.longitude));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** PostGIS returns geography as GeoJSON via our RPCs: { type: 'Point', coordinates: [lng, lat] }. */
export function pointFromGeoJSON(g: { coordinates: [number, number] } | null | undefined): LatLng | null {
  if (!g) return null;
  return { latitude: g.coordinates[1], longitude: g.coordinates[0] };
}
