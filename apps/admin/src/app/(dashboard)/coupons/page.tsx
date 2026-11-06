import { requireAdmin } from '@/lib/auth';
import { ActionResult, Badge, btnDanger, btnPrimary, btnSecondary, Empty, inputCls, PageHeader, Section, Table } from '@/components/ui';
import { inr, ist } from '@/lib/format';
import { createCoupon, toggleCoupon } from './actions';

export const metadata = { title: 'Coupons' };
export const dynamic = 'force-dynamic';

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-ink-2">{label}</span>
      {children}
      {hint && <span className="text-xs text-ink-2">{hint}</span>}
    </label>
  );
}

export default async function CouponsPage({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  const { supabase } = await requireAdmin('coupons');
  const sp = await searchParams;
  const { data } = await supabase
    .from('coupons')
    .select('id, code, description, discount_type, discount_value, max_discount, min_order_value, starts_at, ends_at, usage_limit, per_customer_limit, times_used, is_active, store:stores(name)')
    .order('created_at', { ascending: false });
  const now = Date.now();

  return (
    <>
      <PageHeader title="Coupons" description="Platform-wide discount codes. The platform funds these discounts; shop commissions are worked out on the full item price." />
      <ActionResult {...sp} />
      <Section title="New coupon">
        <form action={createCoupon} className="grid gap-4 rounded-2xl border border-line bg-white p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Code" hint="Capital letters and digits, e.g. WELCOME50">
            <input name="code" required pattern="[A-Za-z0-9]{3,20}" className={`${inputCls} uppercase`} />
          </Field>
          <Field label="Type">
            <select name="discount_type" className={inputCls}>
              <option value="flat">Flat ₹ off</option>
              <option value="percent">% off</option>
            </select>
          </Field>
          <Field label="Value">
            <input name="discount_value" type="number" min={1} step="0.01" required className={inputCls} />
          </Field>
          <Field label="Max discount ₹" hint="For % coupons (optional)">
            <input name="max_discount" type="number" min={1} step="0.01" className={inputCls} />
          </Field>
          <Field label="Minimum order ₹">
            <input name="min_order_value" type="number" min={0} step="0.01" defaultValue={0} className={inputCls} />
          </Field>
          <Field label="Total uses" hint="Empty = unlimited">
            <input name="usage_limit" type="number" min={1} className={inputCls} />
          </Field>
          <Field label="Uses per customer">
            <input name="per_customer_limit" type="number" min={1} defaultValue={1} className={inputCls} />
          </Field>
          <Field label="Description (shown to customers)">
            <input name="description" maxLength={200} className={inputCls} />
          </Field>
          <Field label="Starts" hint="Empty = now">
            <input name="starts_at" type="date" className={inputCls} />
          </Field>
          <Field label="Ends" hint="Empty = no end date">
            <input name="ends_at" type="date" className={inputCls} />
          </Field>
          <div className="flex items-end">
            <button className={btnPrimary}>Create coupon</button>
          </div>
        </form>
      </Section>
      <Section title="All coupons" count={data?.length}>
        {!data?.length ? (
          <Empty>No coupons yet.</Empty>
        ) : (
          <Table head={['Code', 'Discount', 'Conditions', 'Valid', 'Used', 'State', '']}>
            {data.map((c) => {
              const expired = c.ends_at && new Date(c.ends_at).getTime() < now;
              const exhausted = c.usage_limit != null && c.times_used >= c.usage_limit;
              return (
                <tr key={c.id} className="border-t border-line align-top">
                  <td className="px-4 py-3">
                    <p className="font-mono font-bold">{c.code}</p>
                    <p className="text-xs text-ink-2">{c.description}</p>
                    {c.store && <p className="text-xs text-ink-2">Only at {c.store.name}</p>}
                  </td>
                  <td className="px-4 py-3">
                    {c.discount_type === 'percent' ? `${Number(c.discount_value)}%` : inr(c.discount_value)}
                    {c.max_discount && <p className="text-xs text-ink-2">up to {inr(c.max_discount)}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    Min order {inr(c.min_order_value)}
                    <br />
                    {c.per_customer_limit} per customer
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap">
                    {ist(c.starts_at, 'date')} → {c.ends_at ? ist(c.ends_at, 'date') : 'no end'}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {c.times_used}
                    {c.usage_limit ? ` / ${c.usage_limit}` : ''}
                  </td>
                  <td className="px-4 py-3">
                    {!c.is_active ? <Badge>off</Badge> : expired ? <Badge tone="warn">expired</Badge> : exhausted ? <Badge tone="warn">used up</Badge> : <Badge tone="ok">live</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    <form action={toggleCoupon}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="active" value={String(!c.is_active)} />
                      <button className={c.is_active ? btnDanger : btnSecondary}>{c.is_active ? 'Switch off' : 'Switch on'}</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Section>
    </>
  );
}
