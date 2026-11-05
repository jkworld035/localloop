import 'server-only';
import type { Database } from '@localloop/shared';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from '../env';

/**
 * Per-request Supabase client acting as the signed-in admin. It uses the
 * public anon key plus the user's session cookie, so every query is still
 * subject to Row Level Security (admin_can() policies) — the dashboard holds
 * no service-role key.
 */
export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component (read-only cookies); proxy.ts refreshes the session instead.
        }
      },
    },
  });
}
