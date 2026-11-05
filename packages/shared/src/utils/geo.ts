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

/**
 * Decodes a PostGIS point as PostgREST returns it (hex EWKB, e.g.
 * "0101000020E6100000…"). Returns null for anything that isn't a 2-D point.
 */
export function parseEwkbPoint(hex: unknown): LatLng | null {
  if (typeof hex !== 'string' || !/^[0-9a-fA-F]+$/.test(hex) || hex.length < 42) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  const view = new DataView(bytes.buffer);
  const little = bytes[0] === 1;
  const type = view.getUint32(1, little);
  if ((type & 0xff) !== 1) return null; // not a Point
  const hasSrid = (type & 0x20000000) !== 0;
  const offset = 5 + (hasSrid ? 4 : 0);
  if (bytes.length < offset + 16) return null;
  return { longitude: view.getFloat64(offset, little), latitude: view.getFloat64(offset + 8, little) };
}

/** EWKT for writing a point to a geography column through PostgREST (longitude first). */
export function toEwktPoint(p: LatLng): string {
  return `SRID=4326;POINT(${p.longitude} ${p.latitude})`;
}
