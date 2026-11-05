'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase/server';

const credentials = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) });

/** Reasons the login page explains. Kept coarse so it never reveals whether an email has an account. */
export type SignInError = 'invalid' | 'unconfirmed' | 'network' | 'forbidden' | 'unknown';

function classify(err: { code?: string; status?: number; name?: string; message?: string }): SignInError {
  if (err.code === 'email_not_confirmed') return 'unconfirmed';
  if (err.code === 'invalid_credentials' || err.status === 400) return 'invalid';
  // supabase-js reports transport failures as AuthRetryableFetchError / "fetch failed" with no HTTP status.
  if (err.name === 'AuthRetryableFetchError' || /fetch failed|network|ECONN|ENOTFOUND|ETIMEDOUT/i.test(err.message ?? '')) {
    return 'network';
  }
  return 'unknown';
}

export async function signIn(form: FormData) {
  const parsed = credentials.safeParse({ email: form.get('email'), password: form.get('password') });
  if (!parsed.success) redirect('/login?error=invalid');

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    const reason = error ? classify(error) : 'unknown';
    // Server log only (never sent to the browser): enough detail to diagnose without guessing.
    console.error(`[admin sign-in] ${reason}: ${error?.code ?? '-'} ${error?.status ?? '-'} ${error?.message ?? ''}`);
    redirect(`/login?error=${reason}`);
  }

  // Admin status is verified server-side; non-admins are signed straight back out.
  const { data: admin } = await supabase.from('admin_users').select('id').eq('id', data.user.id).maybeSingle();
  if (!admin) {
    await supabase.auth.signOut();
    redirect('/login?error=forbidden');
  }
  redirect('/');
}

export async function signOut() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect('/login');
}
