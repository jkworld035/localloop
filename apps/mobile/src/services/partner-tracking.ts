import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { TRACKING } from '@localloop/shared';
import { supabase } from '@/lib/supabase';
import i18n from '@/lib/i18n';

/**
 * Delivery-partner location pipeline.
 *
 *   OS location service ─► TASK (this file, runs in foreground or background)
 *        └─► update_driver_location RPC ─► delivery_partners / delivery_assignments
 *                 └─► Realtime ─► customer & vendor maps
 *        └─► if the server says eta_due ─► compute-eta edge function (Routes API)
 *
 * Android runs the task inside a foreground service with a persistent
 * notification (required by the OS for background location). iOS shows the
 * blue location indicator. Tracking runs only while the partner is online;
 * going offline stops it, and the server ignores fixes from offline partners
 * without an active delivery.
 *
 * Fixes that fail to upload (no network) are queued and replayed — the
 * server accepts fixes up to 15 minutes old and never lets an older fix
 * overwrite a newer one.
 */
export const PARTNER_LOCATION_TASK = 'localloop-partner-location';
const QUEUE_KEY = 'localloop.partner.location-queue';
const MAX_QUEUE = 120;

type Mode = 'idle' | 'active';

interface QueuedFix {
  lat: number;
  lng: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  at: string;
}

async function readQueue(): Promise<QueuedFix[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(QUEUE_KEY)) ?? '[]') as QueuedFix[];
  } catch {
    return [];
  }
}

async function send(fix: QueuedFix) {
  const { data, error } = await supabase.rpc('update_driver_location', {
    p_lat: fix.lat,
    p_lng: fix.lng,
    p_accuracy_m: fix.accuracy ?? undefined,
    p_heading: fix.heading != null && fix.heading >= 0 ? fix.heading : undefined,
    p_speed_mps: fix.speed != null && fix.speed >= 0 ? fix.speed : undefined,
    p_recorded_at: fix.at,
  });
  if (error) throw error;
  return data as { accepted: boolean; assignments?: { assignment_id: string; eta_due: boolean }[] };
}

async function refreshEtas(result: Awaited<ReturnType<typeof send>>) {
  for (const a of result.assignments ?? []) {
    if (!a.eta_due) continue;
    // Fire-and-forget: the function itself throttles and writes results for Realtime.
    void supabase.functions.invoke('compute-eta', { body: { assignment_id: a.assignment_id } });
  }
}

/** Uploads the newest fix; on failure, queues it and retries the backlog next time. */
export async function handleFixes(locations: Location.LocationObject[]) {
  const fresh: QueuedFix[] = locations.map((l) => ({
    lat: l.coords.latitude,
    lng: l.coords.longitude,
    accuracy: l.coords.accuracy,
    heading: l.coords.heading,
    speed: l.coords.speed,
    at: new Date(l.timestamp).toISOString(),
  }));
  const backlog = [...(await readQueue()), ...fresh]
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(-MAX_QUEUE);

  const remaining: QueuedFix[] = [];
  let latest: Awaited<ReturnType<typeof send>> | null = null;
  for (const fix of backlog) {
    try {
      latest = await send(fix);
    } catch {
      remaining.push(fix);
    }
  }
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
  if (latest) await refreshEtas(latest);
}

// Must be defined at module scope so the OS can wake the JS runtime into it.
// app/_layout.tsx imports this module at startup.
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(PARTNER_LOCATION_TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) return; // signed out: nothing to report
  await handleFixes(data.locations);
});

export async function hasBackgroundPermission(): Promise<boolean> {
  return (await Location.getBackgroundPermissionsAsync()).granted;
}

/**
 * Asks for "Allow all the time". Call only after showing our own explanation
 * (partner.background_permission_*), as both stores require.
 */
export async function requestBackgroundPermission(): Promise<boolean> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) return false;
  return (await Location.requestBackgroundPermissionsAsync()).granted;
}

/**
 * Starts (or reconfigures) tracking. 'active' during a delivery: ~4 s / 10 m
 * fixes at navigation accuracy. 'idle' while online and waiting for offers:
 * ~30 s / 50 m to save battery while keeping dispatch eligibility fresh.
 */
let currentMode: Mode | null = null;

export async function startPartnerTracking(mode: Mode) {
  // Restarting the OS service needlessly drops fixes; only reconfigure when the mode changes.
  if (currentMode === mode && (await Location.hasStartedLocationUpdatesAsync(PARTNER_LOCATION_TASK))) return;
  const active = mode === 'active';
  const options: Location.LocationTaskOptions = {
    accuracy: active ? Location.Accuracy.BestForNavigation : Location.Accuracy.Balanced,
    timeInterval: active ? TRACKING.activeIntervalMs : TRACKING.idleIntervalMs,
    distanceInterval: active ? TRACKING.activeDistanceFilterM : TRACKING.idleDistanceFilterM,
    activityType: Location.ActivityType.OtherNavigation,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: i18n.t('partner.tracking_notification_title'),
      notificationBody: i18n.t('partner.tracking_notification_body'),
      notificationColor: '#174C38',
      killServiceOnDestroy: false,
    },
  };
  if (await Location.hasStartedLocationUpdatesAsync(PARTNER_LOCATION_TASK)) {
    await Location.stopLocationUpdatesAsync(PARTNER_LOCATION_TASK);
  }
  await Location.startLocationUpdatesAsync(PARTNER_LOCATION_TASK, options);
  currentMode = mode;
}

export async function stopPartnerTracking() {
  currentMode = null;
  if (await Location.hasStartedLocationUpdatesAsync(PARTNER_LOCATION_TASK)) {
    await Location.stopLocationUpdatesAsync(PARTNER_LOCATION_TASK);
  }
}
