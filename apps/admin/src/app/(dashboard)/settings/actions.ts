'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';

/** Updates one platform setting. Values are JSON (numbers, booleans, null, strings). Audited by trigger. */
export async function updateSetting(form: FormData) {
  const { supabase } = await requireAdmin('settings');
  const key = String(form.get('key') ?? '');
  const raw = String(form.get('value') ?? '').trim();

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    redirect(`/settings?error=${encodeURIComponent(`${key}: value must be valid JSON (e.g. 0.1, true, null, "text")`)}`);
  }
  if (key === 'commission_rate_default' && (typeof value !== 'number' || value < 0 || value > 1)) {
    redirect(`/settings?error=${encodeURIComponent('Commission must be a number between 0 and 1')}`);
  }

  const { error } = await supabase
    .from('app_settings')
    .update({ value: value as never, updated_by: (await supabase.auth.getUser()).data.user?.id ?? null })
    .eq('key', key);
  if (error) redirect(`/settings?error=${encodeURIComponent(error.message)}`);
  revalidatePath('/settings');
  redirect(`/settings?saved=${encodeURIComponent(key)}`);
}
