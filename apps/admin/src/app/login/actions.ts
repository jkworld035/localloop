'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase/server';

const credentials = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) });

export async function signIn(form: FormData) {
  const parsed = credentials.safeParse({ email: form.get('email'), password: form.get('password') });
  if (!parsed.success) redirect('/login?error=invalid');

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) redirect('/login?error=invalid');

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
