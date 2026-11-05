// Supabase clients for edge functions. The service-role key is available only
// inside the Supabase Functions runtime (never shipped to apps).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Resolves the calling user from their JWT, or null. */
export async function callerId(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getUser();
  return error || !data.user ? null : data.user.id;
}

export function isServiceRequest(req: Request): boolean {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  return !!key && req.headers.get('Authorization') === `Bearer ${key}`;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
