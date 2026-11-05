/** Radius options offered in store discovery (km). "Custom" is free input bounded by MAX_SEARCH_RADIUS_KM. */
export const SEARCH_RADII_KM = [1, 3, 5, 10, 15] as const;
export const DEFAULT_SEARCH_RADIUS_KM = 5;
export const MAX_SEARCH_RADIUS_KM = 50;

/**
 * Initial map camera used ONLY before the device location (or a manual pick) is
 * known — e.g. behind the "choose on map" picker when permission is denied.
 * It is never used as the customer's location. Launch markets themselves are
 * rows in public.serviceable_areas, managed by admins.
 */
export const LAUNCH_MAP_REGION = {
  label: 'Kamareddy, Telangana',
  latitude: 18.3203,
  longitude: 78.337,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
} as const;

/** India bounding box used to sanity-check coordinates entered manually. */
export const INDIA_BOUNDS = { minLat: 6.5, maxLat: 37.5, minLng: 68.0, maxLng: 97.5 } as const;
