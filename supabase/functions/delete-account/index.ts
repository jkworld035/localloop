// delete-account — the in-app "Delete my account" action (Play Store and
// DPDP Act requirement).
//
// 1. As the caller, runs close_my_account(): refuses while orders, a delivery
//    or unsettled COD cash are open; otherwise removes personal data and
//    blocks the profile, keeping anonymous order/payment records.
// 2. With the service role, soft-deletes the sign-in (auth user), so the phone
//    number is released and every session ends.
// If step 2 failed earlier, calling again finishes it.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { adminClient, callerId, json } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const uid = await callerId(req);
  if (!uid) return json({ error: 'not_authenticated' }, 401);

  const admin = adminClient();
  const { data: profile } = await admin.from('profiles').select('is_active, phone, role').eq('id', uid).maybeSingle();
  if (profile?.role === 'admin') return json({ error: 'forbidden' }, 403);

  const alreadyClosed = profile && !profile.is_active && profile.phone === null;
  if (!alreadyClosed) {
    const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization')! } },
      auth: { persistSession: false },
    });
    const { error } = await asUser.rpc('close_my_account');
    // Business refusals (open orders etc.) go back to the app to explain.
    if (error) return json({ error: error.message }, error.code === 'P0001' ? 409 : 500);
  }

  const { error: delError } = await admin.auth.admin.deleteUser(uid, true);
  if (delError) {
    console.error('delete-account: auth deletion failed', uid, delError.message);
    return json({ error: 'deletion_incomplete' }, 500);
  }
  return json({ ok: true });
});
