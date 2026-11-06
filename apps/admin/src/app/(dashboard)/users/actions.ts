'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { back, str } from '@/lib/actions';
import { requireAdmin } from '@/lib/auth';

/** Block or restore sign-in for an account. Blocking needs a reason; it is audited. */
export async function setActive(form: FormData) {
  const userId = z.string().uuid().parse(form.get('user_id'));
  const tab = z.enum(['customer', 'vendor', 'delivery_partner', 'stores']).catch('customer').parse(form.get('tab'));
  const active = form.get('active') === 'true';
  const { supabase } = await requireAdmin('users');
  const { error } = await supabase.rpc('admin_set_user_active', { p_user_id: userId, p_active: active, p_reason: str(form, 'reason') || undefined });
  revalidatePath('/users');
  back(`/users?tab=${tab}`, error ? { error } : { done: active ? 'Account restored.' : 'Account blocked. They can no longer sign in.' });
}

/** Hide or restore a shop (status suspended/approved). Owner is notified by trigger; audited by trigger. */
export async function setStoreStatus(form: FormData) {
  const storeId = z.string().uuid().parse(form.get('store_id'));
  const status = z.enum(['approved', 'suspended']).parse(form.get('status'));
  const reason = str(form, 'reason');
  if (status === 'suspended' && reason.length < 5) back('/users?tab=stores', { error: 'reason_required' });
  const { supabase } = await requireAdmin('stores');
  const { error, count } = await supabase
    .from('stores')
    .update({ status, status_reason: status === 'approved' ? null : reason }, { count: 'exact' })
    .eq('id', storeId);
  revalidatePath('/users');
  back('/users?tab=stores', error || !count ? { error: error ?? 'not_updated' } : { done: status === 'approved' ? 'Shop is visible again.' : 'Shop hidden from customers.' });
}
