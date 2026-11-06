import { requireAdmin } from '@/lib/auth';
import { ActionResult, btnPrimary, btnSecondary, inputCls, PageHeader, Section } from '@/components/ui';
import { createCategory, saveCategory } from './actions';

export const metadata = { title: 'Catalogue' };
export const dynamic = 'force-dynamic';

type Cat = { id: string; kind: 'store' | 'product'; slug: string; name_en: string; name_te: string; icon: string | null; sort_order: number; is_active: boolean; parent_id: string | null };

function Row({ c }: { c: Cat }) {
  return (
    <li className="rounded-xl border border-line bg-white p-3">
      <form action={saveCategory} className="flex flex-wrap items-end gap-2 text-sm">
        <input type="hidden" name="id" value={c.id} />
        <span className="w-32 font-mono text-xs text-ink-2">{c.slug}</span>
        <label className="flex flex-col">
          <span className="text-xs text-ink-2">English</span>
          <input name="name_en" defaultValue={c.name_en} required className={`${inputCls} w-40`} />
        </label>
        <label className="flex flex-col">
          <span className="text-xs text-ink-2">Telugu</span>
          <input name="name_te" defaultValue={c.name_te} required lang="te" className={`${inputCls} w-40`} />
        </label>
        <label className="flex flex-col">
          <span className="text-xs text-ink-2">Icon key</span>
          <input name="icon" defaultValue={c.icon ?? ''} className={`${inputCls} w-28`} />
        </label>
        <label className="flex flex-col">
          <span className="text-xs text-ink-2">Order</span>
          <input name="sort_order" type="number" min={0} defaultValue={c.sort_order} className={`${inputCls} w-20`} />
        </label>
        <label className="flex h-10 items-center gap-2">
          <input type="checkbox" name="is_active" defaultChecked={c.is_active} className="h-4 w-4" />
          Shown
        </label>
        <button className={btnSecondary}>Save</button>
      </form>
    </li>
  );
}

export default async function CataloguePage({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  const { supabase } = await requireAdmin('catalog');
  const sp = await searchParams;
  const { data } = await supabase.from('categories').select('id, kind, slug, name_en, name_te, icon, sort_order, is_active, parent_id').order('sort_order').order('name_en');
  const cats = (data ?? []) as Cat[];
  const storeCats = cats.filter((c) => c.kind === 'store');
  const productCats = cats.filter((c) => c.kind === 'product');

  return (
    <>
      <PageHeader
        title="Catalogue"
        description="Shop types customers browse by, and product categories vendors file items under. Hidden categories disappear from the apps but existing shops and products keep them."
      />
      <ActionResult {...sp} />
      <Section title="Shop types" count={storeCats.length}>
        <ul className="space-y-2">{storeCats.map((c) => <Row key={c.id} c={c} />)}</ul>
      </Section>
      <Section title="Product categories" count={productCats.length}>
        <ul className="space-y-2">{productCats.map((c) => <Row key={c.id} c={c} />)}</ul>
      </Section>
      <Section title="Add a category">
        <form action={createCategory} className="flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-white p-5 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-ink-2">Type</span>
            <select name="kind" className={inputCls}>
              <option value="product">Product category</option>
              <option value="store">Shop type</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-ink-2">Slug</span>
            <input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="dry-fruits" className={`${inputCls} w-36`} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-ink-2">English name</span>
            <input name="name_en" required className={`${inputCls} w-40`} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-ink-2">Telugu name</span>
            <input name="name_te" required lang="te" className={`${inputCls} w-40`} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-ink-2">Icon key</span>
            <input name="icon" className={`${inputCls} w-28`} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-ink-2">Order</span>
            <input name="sort_order" type="number" min={0} defaultValue={100} className={`${inputCls} w-20`} />
          </label>
          <button className={btnPrimary}>Add</button>
        </form>
      </Section>
    </>
  );
}
