'use client';

import type { Database } from '@localloop/shared';
import { createBrowserClient } from '@supabase/ssr';
import { env } from '../env';

let client: ReturnType<typeof createBrowserClient<Database>> | null = null;

/** Browser client for live views (Realtime). Same session cookie and RLS as the server client. */
export function supabaseBrowser() {
  client ??= createBrowserClient<Database>(env.supabaseUrl, env.supabaseAnonKey);
  return client;
}
