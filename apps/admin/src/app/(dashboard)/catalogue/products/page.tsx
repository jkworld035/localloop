import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { productPhotoUrl } from '@/lib/format';
import { ActionResult, Badge, btnPrimary, btnSecondary, Empty, inputCls, PageHeader, Table } from '@/components/ui';
import { setTemplateActive } from './actions';

export const metadata = { title: 'Product catalogue' };
export const dynamic = 'force-dynamic';

export default async function CatalogueProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; done?: string; error?: string }> }) {
  const { supabase } = await requireAdmin('catalog');
  const sp = await searchParams;
  const q = (sp.q ?? '').trim().replace(/[%,()]/g, ' ').slice(0, 60);
  let query = supabase
    .from('catalog_templates')
    .select('id, name, name_te, brand, image_paths, sizes, highlights, is_active, use_count, category:categories(name_en)', { count: 'exact' })
    .order('is_active', { ascending: false })
    .order('use_count', { ascending: false })
    .order('name')
    .limit(200);
  if (q) query = query.or(`name.ilike.%${q}%,name_te.ilike.%${q}%,brand.ilike.%${q}%`);
  const { data, count } = await query;
  const rows = data ?? [];

  return (
    <>
      <PageHeader
        title="Product catalogue"
        description="Common products with photos, descriptions and benefits. When a shop owner types a product name in the app, matches from here appear and fill in the form — they only set their price and stock."
      />
      <ActionResult done={sp.done} error={sp.error} />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <form className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Search name or brand" className={`${inputCls} w-64`} aria-label="Search the catalogue" />
          <button className={btnSecondary}>Search</button>
        </form>
        <Link href="/catalogue/products/new" className={`${btnPrimary} inline-flex items-center`}>
          Add product
        </Link>
        <Link href="/catalogue" className="text-sm font-medium text-forest hover:underline">
          Categories →
        </Link>
      </div>
      {rows.length === 0 ? (
        <Empty>{q ? `Nothing matches “${q}”.` : 'No catalogue products yet. Add the items shops in town sell most — rice, atta, oil, milk, soaps.'}</Empty>
      ) : (
        <>
          <p className="mb-2 text-sm text-ink-2">{count ?? rows.length} products</p>
          <Table head={['', 'Product', 'Category', 'Sizes', 'Used by shops', 'Status', '']}>
            {rows.map((r) => {
              const photo = productPhotoUrl(r.image_paths[0]);
              const sizes = Array.isArray(r.sizes) ? (r.sizes as { label: string }[]) : [];
              return (
                <tr key={r.id} className="border-t border-line align-middle">
                  <td className="px-4 py-2">
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photo} alt="" className="h-12 w-12 rounded-lg object-cover" />
                    ) : (
                      <div className="h-12 w-12 rounded-lg bg-sunken" title="No photo" />
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <Link href={`/catalogue/products/${r.id}`} className="font-medium text-forest hover:underline">
                      {r.name}
                    </Link>
                    <div className="text-xs text-ink-2" lang="te">
                      {[r.brand, r.name_te].filter(Boolean).join(' · ')}
                    </div>
                  </td>
                  <td className="px-4 py-2">{(r.category as { name_en: string } | null)?.name_en ?? '—'}</td>
                  <td className="px-4 py-2 text-ink-2">{sizes.map((s) => s.label).join(', ') || '—'}</td>
                  <td className="px-4 py-2 tabular-nums">{r.use_count}</td>
                  <td className="px-4 py-2">
                    {r.is_active ? <Badge tone="ok">shown</Badge> : <Badge tone="bad">hidden</Badge>}
                    {!r.image_paths.length && <span className="ml-2"><Badge tone="warn">no photo</Badge></span>}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <form action={setTemplateActive}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="active" value={String(!r.is_active)} />
                      <button className="text-sm font-medium text-forest hover:underline">{r.is_active ? 'Hide' : 'Show'}</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </Table>
        </>
      )}
    </>
  );
}
