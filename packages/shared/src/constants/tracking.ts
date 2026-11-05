/**
 * Client-side tracking parameters. Server-side cost controls (when the ETA
 * edge function actually calls the Routes API) live in
 * supabase/functions/_shared/eta-policy.ts.
 */
export const TRACKING = {
  /** Target interval between GPS fixes while on an active delivery. */
  activeIntervalMs: 4000,
  /** Minimum movement before the OS reports a new fix. */
  activeDistanceFilterM: 10,
  /** Interval while online but idle (waiting for offers). */
  idleIntervalMs: 30000,
  idleDistanceFilterM: 50,
  /** Older than this, the customer map labels the marker "last seen …". */
  staleAfterMs: 30000,
  /** Older than this, the marker is greyed out and ETA marked unavailable. */
  lostAfterMs: 120000,
} as const;
