import { formatSizeLine } from '@localloop/shared';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { ActionResult, btnPrimary, inputCls, PageHeader } from '@/components/ui';
import { saveTemplate } from '../actions';
import { PhotoField } from './PhotoField';

export const metadata = { title: 'Catalogue product' };
export const dynamic = 'force-dynamic';

const area = `${inputCls} h-auto py-2`;

export default async function CatalogueProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ done?: string; error?: string }>;
}) {
  const { supabase } = await requireAdmin('catalog');
  const { id } = await params;
  const sp = await searchParams;
  const isNew = id === 'new';
  if (!isNew && !/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [{ data: cats }, tpl] = await Promise.all([
    supabase.from('categories').select('id, name_en').eq('kind', 'product').eq('is_active', true).order('sort_order').order('name_en'),
    isNew ? Promise.resolve(null) : supabase.from('catalog_templates').select('*').eq('id', id).maybeSingle().then((r) => r.data),
  ]);
  if (!isNew && !tpl) notFound();
  const sizes = Array.isArray(tpl?.sizes) ? (tpl.sizes as { label: string; mrp?: number | null }[]) : [];
  const photos = tpl?.image_paths ?? [];
  // New products get their id up front so photos can upload straight to storage before the first save.
  const templateId = tpl?.id ?? crypto.randomUUID();

  return (
    <>
      <PageHeader
        title={isNew ? 'Add catalogue product' : tpl!.name}
        description={isNew ? 'Shop owners will see this while typing a product name, and can add it to their shop in one tap.' : `Added by ${tpl!.use_count} shop(s). Changes here don't alter products shops already added.`}
      />
      <Link href="/catalogue/products" className="mb-4 inline-block text-sm font-medium text-forest hover:underline">
        ← All catalogue products
      </Link>
      <ActionResult done={sp.done} error={sp.error} />
      <form action={saveTemplate} className="grid max-w-4xl gap-5 rounded-2xl border border-line bg-white p-6 text-sm md:grid-cols-2">
        <input type="hidden" name="id" value={templateId} />
        <input type="hidden" name="is_new" value={isNew ? '1' : ''} />
        <label className="flex flex-col gap-1">
          <span className="text-ink-2">Name (English)</span>
          <input name="name" required minLength={2} maxLength={120} defaultValue={tpl?.name ?? ''} placeholder="Aashirvaad Whole Wheat Atta" className={inputCls} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-ink-2">Name (Telugu)</span>
          <input name="name_te" maxLength={120} lang="te" defaultValue={tpl?.name_te ?? ''} placeholder="ఆశీర్వాద్ గోధుమ పిండి" className={inputCls} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-ink-2">Brand</span>
          <input name="brand" maxLength={60} defaultValue={tpl?.brand ?? ''} placeholder="Aashirvaad" className={inputCls} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-ink-2">Category</span>
          <select name="category_id" required defaultValue={tpl?.category_id ?? ''} className={inputCls}>
            <option value="" disabled>
              Choose…
            </option>
            {(cats ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name_en}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-ink-2">Description (English)</span>
          <textarea name="description" rows={4} maxLength={2000} defaultValue={tpl?.description ?? ''} className={area} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-ink-2">Description (Telugu)</span>
          <textarea name="description_te" rows={4} maxLength={2000} lang="te" defaultValue={tpl?.description_te ?? ''} className={area} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-ink-2">Benefits (English) — one per line, up to 8</span>
          <textarea name="highlights" rows={5} defaultValue={tpl?.highlights.join('\n') ?? ''} placeholder={'100% whole wheat\nSoft rotis\nNo added maida'} className={area} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-ink-2">Benefits (Telugu) — one per line</span>
          <textarea name="highlights_te" rows={5} lang="te" defaultValue={tpl?.highlights_te.join('\n') ?? ''} className={area} />
        </label>
        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="text-ink-2">
            Usual sizes — one per line as <code>size | MRP</code>, e.g. <code>1 kg | 72</code>, <code>500 ml | 34</code>, <code>Pack of 6 | 120</code>. MRP is optional; shops change prices themselves.
          </span>
          <textarea name="sizes" rows={4} defaultValue={sizes.map(formatSizeLine).join('\n')} placeholder={'1 kg | 72\n5 kg | 310'} className={`${area} font-mono`} />
        </label>

        <PhotoField templateId={templateId} existing={photos} />

        <label className="flex items-center gap-2 md:col-span-2">
          <input type="checkbox" name="is_active" defaultChecked={tpl?.is_active ?? true} className="h-4 w-4" />
          Shown to shop owners
        </label>
        <div className="md:col-span-2">
          <button className={btnPrimary}>{isNew ? 'Add to catalogue' : 'Save'}</button>
        </div>
      </form>
    </>
  );
}
