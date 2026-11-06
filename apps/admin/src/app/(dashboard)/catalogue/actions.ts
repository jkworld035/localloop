'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { back } from '@/lib/actions';
import { requireAdmin } from '@/lib/auth';

const fields = z.object({
  name_en: z.string().trim().min(2).max(60),
  name_te: z.string().trim().min(1).max(60),
  icon: z.string().trim().max(40).regex(/^[a-z0-9-]*$/, 'icon').transform((v) => v || null),
  sort_order: z.coerce.number().int().min(0).max(9999),
  is_active: z.preprocess((v) => v === 'on', z.boolean()),
});

const read = (f: FormData) => Object.fromEntries(['name_en', 'name_te', 'icon', 'sort_order', 'is_active'].map((k) => [k, f.get(k) ?? undefined]));

export async function saveCategory(form: FormData) {
  const id = z.string().uuid().parse(form.get('id'));
  const parsed = fields.safeParse(read(form));
  if (!parsed.success) back('/catalogue', { error: 'Check the names (English 2–60 characters, Telugu required) and the order number.' });
  const { supabase } = await requireAdmin('catalog');
  const { error } = await supabase.from('categories').update(parsed.data).eq('id', id);
  revalidatePath('/catalogue');
  back('/catalogue', error ? { error } : { done: `Saved “${parsed.data.name_en}”. Apps pick it up on next refresh.` });
}

export async function createCategory(form: FormData) {
  const parsed = fields
    .extend({
      kind: z.enum(['store', 'product']),
      slug: z.string().trim().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
      parent_id: z.string().uuid().or(z.literal('')).transform((v) => v || null),
    })
    .safeParse({ ...read(form), is_active: 'on', kind: form.get('kind'), slug: form.get('slug'), parent_id: form.get('parent_id') ?? '' });
  if (!parsed.success) back('/catalogue', { error: 'Slug must be lowercase letters, numbers and hyphens (e.g. “dry-fruits”); names are required.' });
  const { supabase } = await requireAdmin('catalog');
  const { error } = await supabase.from('categories').insert(parsed.data);
  revalidatePath('/catalogue');
  back('/catalogue', error ? { error } : { done: `Added “${parsed.data.name_en}”.` });
}
