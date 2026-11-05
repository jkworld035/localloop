import 'react-native-url-polyfill/auto';
import type { Database } from '@localloop/shared';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import { env } from './env';
import { SecureSessionStorage } from './secure-session-storage';

/**
 * The only Supabase client in the app. It uses the public anon key; every
 * read and write is constrained by Row Level Security and the role checks in
 * the database functions. The service-role key never ships in the app.
 */
export const supabase = createClient<Database>(
  env.supabaseUrl || 'http://unconfigured.invalid',
  env.supabaseAnonKey || 'unconfigured',
  {
    auth: {
      storage: Platform.OS === 'web' ? undefined : new SecureSessionStorage(),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    realtime: { params: { eventsPerSecond: 10 } },
  },
);

// Refresh tokens only while the app is in the foreground (Supabase RN guidance).
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
