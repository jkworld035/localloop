// admin-invite — adds a staff member to the admin panel (super admins only).
//
// Creates a confirmed email sign-in with a one-time password (or reuses an
// existing account with that email), grants the admin role through
// admin_grant_role() as the caller — so the database checks the caller's own
// permission and records it in the audit log — and flags the account to set
// its own password at first sign-in. The temporary password is returned once
// for the super admin to pass on in person or by phone; it is never stored.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { adminClient, callerId, json } from '../_shared/supabase.ts';

const ROLES = ['super_admin', 'operations', 'support', 'finance'];

function tempPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const uid = await callerId(req);
  if (!uid) return json({ error: 'not_authenticated' }, 401);

  let body: { email?: string; name?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_request' }, 400);
  }
  const email = String(body.email ?? '').trim().toLowerCase();
  const name = String(body.name ?? '').trim();
  const role = String(body.role ?? '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !ROLES.includes(role) || name.length < 2) {
    return json({ error: 'invalid_request' }, 400);
  }

  // As the caller: only super admins (permission 'admins') get past this.
  const asCaller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization')! } },
    auth: { persistSession: false },
  });
  const { error: permError } = await asCaller.rpc('admin_team');
  if (permError) return json({ error: permError.message === 'forbidden' ? 'forbidden' : 'lookup_failed' }, 403);

  const db = adminClient();
  let userId: string;
  let password: string | null = null;
  const { data: existing } = await db.from('profiles').select('id').eq('email', email).maybeSingle();
  if (existing) {
    userId = existing.id;
  } else {
    password = tempPassword();
    const { data: created, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } });
    if (error || !created.user) return json({ error: error?.message ?? 'create_failed' }, 400);
    userId = created.user.id;
  }

  const { error: grantError } = await asCaller.rpc('admin_grant_role', { p_user_id: userId, p_role: role, p_name: name });
  if (grantError) {
    // Don't leave an orphan sign-in behind for a brand-new account.
    if (password) await db.auth.admin.deleteUser(userId);
    return json({ error: grantError.message }, 409);
  }
  if (password) await db.from('admin_users').update({ must_change_password: true }).eq('id', userId);
  return json({ ok: true, existing: !password, temp_password: password });
});
