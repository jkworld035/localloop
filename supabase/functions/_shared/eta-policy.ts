// Pure, dependency-free logic for the compute-eta function. Unit-tested with
// vitest (eta-policy.test.ts) and imported by Deno at runtime.

export interface Point {
  latitude: number;
  longitude: number;
}

export type Leg = 'to_store' | 'to_customer';
export type RecomputeReason = 'initial' | 'status_change' | 'interval' | 'moved' | 'forced';

export interface EtaDecisionInput {
  assignmentStatus: string;
  partner: (Point & { at: string | null }) | null;
  etaOrigin: Point | null;
  etaComputedAt: string | null;
  pickedUpAt: string | null;
  policy: { intervalSeconds: number; distanceMeters: number };
  now?: Date;
  /** Hard floor between provider calls, regardless of what the client asks. */
  minSecondsBetweenCalls?: number;
  force?: boolean;
}

export type EtaDecision =
  | { recompute: true; leg: Leg; reason: RecomputeReason }
  | { recompute: false; reason: 'inactive' | 'no_location' | 'stale_location' | 'fresh' | 'throttled' };

const EARTH_RADIUS_M = 6_371_008.8;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineMeters(a: Point, b: Point): number {
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Partner fix older than this is not worth routing from — the customer sees "last seen" instead. */
export const MAX_LOCATION_AGE_S = 120;

/**
 * Decides whether to pay for a new route. The Routes API is billed per call,
 * so we recompute only when the answer could have meaningfully changed:
 * no route yet, the leg changed (pickup happened), the partner moved
 * `distanceMeters` from where the last route started, or `intervalSeconds`
 * elapsed (traffic drift). A hard throttle stops a misbehaving client.
 */
export function decideEtaRecompute(input: EtaDecisionInput): EtaDecision {
  const now = input.now ?? new Date();
  if (input.assignmentStatus !== 'accepted' && input.assignmentStatus !== 'picked_up') {
    return { recompute: false, reason: 'inactive' };
  }
  const leg: Leg = input.assignmentStatus === 'picked_up' ? 'to_customer' : 'to_store';
  if (!input.partner) return { recompute: false, reason: 'no_location' };
  if (input.partner.at && (now.getTime() - new Date(input.partner.at).getTime()) / 1000 > MAX_LOCATION_AGE_S) {
    return { recompute: false, reason: 'stale_location' };
  }

  const computedAt = input.etaComputedAt ? new Date(input.etaComputedAt) : null;
  const sinceLast = computedAt ? (now.getTime() - computedAt.getTime()) / 1000 : Infinity;
  const floor = input.minSecondsBetweenCalls ?? 15;

  if (!computedAt || !input.etaOrigin) return { recompute: true, leg, reason: 'initial' };
  if (input.pickedUpAt && new Date(input.pickedUpAt) > computedAt) return { recompute: true, leg, reason: 'status_change' };
  if (sinceLast < floor) return { recompute: false, reason: 'throttled' };
  if (input.force) return { recompute: true, leg, reason: 'forced' };
  if (haversineMeters(input.etaOrigin, input.partner) >= input.policy.distanceMeters) {
    return { recompute: true, leg, reason: 'moved' };
  }
  if (sinceLast >= input.policy.intervalSeconds) return { recompute: true, leg, reason: 'interval' };
  return { recompute: false, reason: 'fresh' };
}

/** Google Routes API travel mode for our vehicle types (TWO_WHEELER is supported in India). */
export function travelModeFor(vehicle: string): 'TWO_WHEELER' | 'DRIVE' | 'BICYCLE' {
  if (vehicle === 'car') return 'DRIVE';
  if (vehicle === 'bicycle') return 'BICYCLE';
  return 'TWO_WHEELER';
}

/** Traffic-aware routing is only available for motor vehicles. */
export function routingPreferenceFor(mode: string): 'TRAFFIC_AWARE' | undefined {
  return mode === 'DRIVE' || mode === 'TWO_WHEELER' ? 'TRAFFIC_AWARE' : undefined;
}

export function buildRoutesRequest(origin: Point, destination: Point, vehicle: string, language: 'en' | 'te' = 'en') {
  const travelMode = travelModeFor(vehicle);
  const routingPreference = routingPreferenceFor(travelMode);
  return {
    origin: { location: { latLng: { latitude: origin.latitude, longitude: origin.longitude } } },
    destination: { location: { latLng: { latitude: destination.latitude, longitude: destination.longitude } } },
    travelMode,
    ...(routingPreference ? { routingPreference } : {}),
    regionCode: 'IN',
    languageCode: language === 'te' ? 'te-IN' : 'en-IN',
    units: 'METRIC',
  };
}

export const ROUTES_FIELD_MASK = 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline';

export interface ParsedRoute {
  distanceMeters: number;
  durationSeconds: number;
  polyline: string | null;
}

/** Parses a computeRoutes response. Throws when no usable route came back. */
export function parseRoutesResponse(body: unknown): ParsedRoute {
  const route = (body as { routes?: Array<Record<string, unknown>> })?.routes?.[0];
  if (!route) throw new Error('no_route');
  // distanceMeters is omitted when origin == destination.
  const distanceMeters = typeof route.distanceMeters === 'number' ? route.distanceMeters : 0;
  const durationRaw = route.duration;
  const match = typeof durationRaw === 'string' ? /^(\d+(?:\.\d+)?)s$/.exec(durationRaw) : null;
  if (!match) throw new Error('bad_duration');
  const polyline = (route.polyline as { encodedPolyline?: string } | undefined)?.encodedPolyline ?? null;
  return { distanceMeters, durationSeconds: Math.round(Number(match[1])), polyline };
}
