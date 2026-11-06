'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { back } from '@/lib/actions';
import { requireAdmin } from '@/lib/auth';

/** Publish or hide a review. Ratings recalculate by trigger; the change is audited. */
export async function moderate(form: FormData) {
  const id = z.string().uuid().parse(form.get('id'));
  const status = z.enum(['published', 'hidden']).parse(form.get('status'));
  const { supabase } = await requireAdmin('reviews');
  const { error } = await supabase.from('reviews').update({ status }).eq('id', id);
  revalidatePath('/reviews');
  back('/reviews', error ? { error } : { done: status === 'hidden' ? 'Review hidden. Ratings updated.' : 'Review published.' });
}
