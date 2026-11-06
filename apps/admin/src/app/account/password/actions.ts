'use server';

import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';

export async function setPassword(_prev: string | null, form: FormData): Promise<string | null> {
  const password = String(form.get('password') ?? '');
  const confirm = String(form.get('confirm') ?? '');
  if (password.length < 12) return 'Use at least 12 characters.';
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return 'Use letters and at least one number.';
  if (password !== confirm) return 'The two passwords don’t match.';
  const { supabase } = await requireAdmin();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return error.message.includes('different') ? 'Choose a password different from the one-time password.' : error.message;
  await supabase.rpc('admin_password_changed');
  redirect('/?done=' + encodeURIComponent('Password updated.'));
}
