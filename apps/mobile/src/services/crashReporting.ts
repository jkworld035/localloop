import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { isConfigured } from '@/lib/env';
import { supabase } from '@/lib/supabase';

/**
 * Sends app crashes and unexpected errors to the client_errors table (admin →
 * App health). Best effort: never throws, never blocks the UI, skips in
 * development (you see the red screen there), and de-duplicates bursts.
 */
const version = `${Constants.expoConfig?.version ?? '?'}${__DEV__ ? '-dev' : ''}`;
const recent = new Map<string, number>();
let currentScreen: string | null = null;

export function setCurrentScreen(path: string) {
  // Route paths only (e.g. /order/[id]) — ids and query strings are dropped.
  currentScreen = path.split('?')[0]!.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, '[id]');
}

export function reportError(error: unknown, fatal = false) {
  if (__DEV__ || !isConfigured) return;
  const e = error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error));
  const key = `${e.message}|${currentScreen}`;
  const now = Date.now();
  if ((recent.get(key) ?? 0) > now - 60_000) return;
  recent.set(key, now);
  void supabase
    .rpc('report_client_error', {
      p_app_version: version,
      p_platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
      p_message: `${e.name}: ${e.message}`.slice(0, 500),
      p_stack: e.stack?.slice(0, 4000),
      p_screen: currentScreen ?? undefined,
      p_is_fatal: fatal,
    })
    .then(
      () => undefined,
      () => undefined,
    );
}

type GlobalHandler = (error: unknown, isFatal?: boolean) => void;
declare const ErrorUtils: { getGlobalHandler(): GlobalHandler; setGlobalHandler(h: GlobalHandler): void } | undefined;

let installed = false;
/** Catches errors that escape React (event handlers, timers, promises in native callbacks). */
export function installCrashReporting() {
  if (installed || typeof ErrorUtils === 'undefined') return;
  installed = true;
  const previous = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    reportError(error, !!isFatal);
    previous(error, isFatal);
  });
}
