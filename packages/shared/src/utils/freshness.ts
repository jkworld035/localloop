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
