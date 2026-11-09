'use server';

import { parseSizeLines } from '@localloop/shared';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { back, str } from '@/lib/actions';
import { requireAdmin } from '@/lib/auth';

const lines = (s: string) =>
  s
    .split('\n')
    .map((x) => x.trim().slice(0, 120))
    .filter(Boolean);

const fields = z.object({
  category_id: z.string().uuid('Choose a category.'),
  name: z.string().min(2, 'English name needs at least 2 characters.').max(120),
  name_te: z.string().max(120),
  brand: z.string().max(60),
  description: z.string().max(2000),
  description_te: z.string().max(2000),
  highlights: z.array(z.string()).max(8, 'Up to 8 benefits.'),
  highlights_te: z.array(z.string()).max(8, 'Up to 8 Telugu benefits.'),
  sizes: z.array(z.object({ label: z.string(), unit: z.string(), unit_quantity: z.number(), mrp: z.number().nullable() })).max(10),
  image_paths: z.array(z.string()).max(5, 'Up to 5 photos.'),
  is_active: z.boolean(),
});

/** Creates or updates a catalogue product. Photos were uploaded by the browser; this saves their paths. */
export async function saveTemplate(form: FormData) {
  const id = z.string().uuid().parse(form.get('id'));
  const isNew = form.get('is_new') === '1';
  const page = `/catalogue/products/${isNew ? 'new' : id}`;
  const parsed = fields.safeParse({
    category_id: str(form, 'category_id'),
    name: str(form, 'name'),
    name_te: str(form, 'name_te'),
    brand: str(form, 'brand'),
    description: str(form, 'description'),
    description_te: str(form, 'description_te'),
    highlights: lines(str(form, 'highlights')),
    highlights_te: lines(str(form, 'highlights_te')),
    sizes: parseSizeLines(str(form, 'sizes')),
    // Only this product's own folder.
    image_paths: form.getAll('image_paths').map(String).filter((p) => p.startsWith(`catalog/${id}/`)),
    is_active: form.get('is_active') === 'on',
  });
  if (!parsed.success) back(page, { error: parsed.error.issues[0]?.message ?? 'Check the form.' });

  const { supabase, userId } = await requireAdmin('catalog');
  let before: string[] = [];
  if (isNew) {
    const { error } = await supabase.from('catalog_templates').insert({ id, ...parsed.data, created_by: userId });
    if (error) back(page, { error });
  } else {
    const { data: cur } = await supabase.from('catalog_templates').select('image_paths').eq('id', id).maybeSingle();
    if (!cur) back('/catalogue/products', { error: 'That catalogue product no longer exists.' });
    before = cur.image_paths;
    const { error } = await supabase.from('catalog_templates').update(parsed.data).eq('id', id);
    if (error) back(page, { error });
  }

  // Removed photos: delete the file unless a shop's product still shows it.
  for (const p of before.filter((x) => !parsed.data.image_paths.includes(x))) {
    const { count } = await supabase.from('product_images').select('id', { count: 'exact', head: true }).eq('storage_path', p);
    if (!count) await supabase.storage.from('product-media').remove([p]);
  }

  revalidatePath('/catalogue/products');
  back(`/catalogue/products/${id}`, { done: `Saved “${parsed.data.name}”. Shop owners see it when they type the name.` });
}

export async function setTemplateActive(form: FormData) {
  const id = z.string().uuid().parse(form.get('id'));
  const active = form.get('active') === 'true';
  const { supabase } = await requireAdmin('catalog');
  const { error } = await supabase.from('catalog_templates').update({ is_active: active }).eq('id', id);
  revalidatePath('/catalogue/products');
  back('/catalogue/products', error ? { error } : { done: active ? 'Shown to shop owners again.' : 'Hidden from shop owners. Products already added keep their details.' });
}
