'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { back, str } from '@/lib/actions';
import { requireAdmin } from '@/lib/auth';

export async function replyTicket(form: FormData) {
  const id = z.string().uuid().parse(form.get('ticket_id'));
  const status = z.enum(['open', 'in_progress', 'resolved', 'closed', '']).catch('').parse(form.get('status'));
  const body = str(form, 'body');
  const path = `/support/${id}`;
  if (!body && !status) back(path, { error: 'Write a reply or choose a status.' });
  const { supabase } = await requireAdmin('tickets');
  const { error } = await supabase.rpc('admin_reply_ticket', { p_ticket_id: id, p_body: body, p_status: status || undefined });
  revalidatePath(path);
  revalidatePath('/support');
  back(path, error ? { error } : { done: body ? 'Reply sent. The customer gets a notification.' : 'Status updated.' });
}
