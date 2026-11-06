'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { back, str } from '@/lib/actions';
import { requireAdmin } from '@/lib/auth';

const num = (min: number, max: number) => z.coerce.number().min(min).max(max);

export async function saveArea(form: FormData) {
  const id = z.string().uuid().or(z.literal('new')).parse(form.get('id'));
  const path = `/areas/${id}`;
  const parsed = z
    .object({ lat: num(6, 38), lng: num(68, 98), radius: num(0.5, 100) })
    .safeParse({ lat: form.get('lat'), lng: form.get('lng'), radius: form.get('radius') });
  if (!parsed.success) back(path, { error: 'Set the centre on the map and a radius between 0.5 and 100 km.' });
  let boundary: unknown = null;
  const raw = str(form, 'boundary');
  if (raw) {
    try {
      boundary = JSON.parse(raw);
    } catch {
      back(path, { error: 'The drawn boundary could not be read. Clear it and draw again.' });
    }
  }
  const { supabase } = await requireAdmin('areas');
  const { data, error } = await supabase.rpc('admin_save_area', {
    p_id: id === 'new' ? (null as never) : id,
    p_name: str(form, 'name'),
    p_city: str(form, 'city'),
    p_state: str(form, 'state'),
    p_lat: parsed.data.lat,
    p_lng: parsed.data.lng,
    p_radius_km: parsed.data.radius,
    p_boundary: boundary as never,
    p_is_active: form.get('is_active') === 'on',
  });
  if (error) back(path, { error: error.message === 'invalid_area' ? `Not saved: ${error.details ?? 'check the details'}.` : error });
  const r = data as { id: string; stores_moved: number; stores_inside: number };
  revalidatePath('/areas');
  const msg = `Saved. ${r.stores_inside} shop${r.stores_inside === 1 ? '' : 's'} inside${r.stores_moved ? `; ${r.stores_moved} changed area` : ''}.`;
  redirect(`/areas/${r.id}?done=${encodeURIComponent(msg)}`);
}
