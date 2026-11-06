import { TRACKING } from '../constants/tracking';

export type Freshness = 'live' | 'stale' | 'lost';

/**
 * Classifies a partner location by age so the UI never presents an old fix as
 * live: 'live' (normal marker), 'stale' ("last updated 45s ago"), 'lost'
 * (greyed marker, ETA hidden, "waiting for partner's location").
 */
export function locationFreshness(recordedAt: string | Date | null, now: Date = new Date()): Freshness {
  if (!recordedAt) return 'lost';
  const age = now.getTime() - new Date(recordedAt).getTime();
  if (age <= TRACKING.staleAfterMs) return 'live';
  if (age <= TRACKING.lostAfterMs) return 'stale';
  return 'lost';
}

/**
 * The customer-facing arrival estimate, or null when it shouldn't be shown:
 * no routed ETA yet, or the partner position behind it is no longer live.
 * The estimate counts down from when the server computed it.
 */
export function arrivalEstimate(
  a: { eta_seconds: number | null; eta_computed_at: string | null; location_at: string | null },
  now: Date = new Date(),
): { arrival: Date; minutes: number } | null {
  if (a.eta_seconds == null || !a.eta_computed_at) return null;
  if (locationFreshness(a.location_at, now) !== 'live') return null;
  const arrival = new Date(new Date(a.eta_computed_at).getTime() + a.eta_seconds * 1000);
  return { arrival, minutes: Math.max(1, Math.ceil((arrival.getTime() - now.getTime()) / 60000)) };
}
