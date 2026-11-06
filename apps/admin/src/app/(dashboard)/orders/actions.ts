'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { back, str } from '@/lib/actions';
import { requireAdmin } from '@/lib/auth';

const id = z.string().uuid();

export async function cancelOrder(form: FormData) {
  const orderId = id.parse(form.get('order_id'));
  const path = `/orders/${orderId}`;
  const { supabase } = await requireAdmin('orders');
  const restock = str(form, 'restock');
  const { error } = await supabase.rpc('admin_cancel_order', {
    p_order_id: orderId,
    p_reason: str(form, 'reason'),
    p_restock: restock === '' ? undefined : restock === 'yes',
  });
  revalidatePath(path);
  back(path, error ? { error } : { done: 'Order cancelled. The customer and shop have been notified.' });
}

export async function redispatch(form: FormData) {
  const orderId = id.parse(form.get('order_id'));
  const path = `/orders/${orderId}`;
  const { supabase } = await requireAdmin('deliveries');
  const { data, error } = await supabase.rpc('admin_redispatch', { p_order_id: orderId, p_release_partner: form.get('release') === 'on' });
  revalidatePath(path);
  back(
    path,
    error
      ? { error }
      : { done: data ? `Sent to ${data} nearby partner${data === 1 ? '' : 's'}.` : 'No free partner is online near the shop right now. Try again shortly.' },
  );
}
