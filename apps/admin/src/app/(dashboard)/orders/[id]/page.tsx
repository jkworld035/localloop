import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin, roleCan } from '@/lib/auth';
import { ActionResult, btnDanger, btnSecondary, inputCls, PageHeader, Section, StatusBadge, Table } from '@/components/ui';
import { inr, ist, label } from '@/lib/format';
import { cancelOrder, redispatch } from '../actions';

export const metadata = { title: 'Order' };
export const dynamic = 'force-dynamic';

const OPEN = ['placed', 'accepted', 'preparing', 'ready_for_pickup', 'picked_up'];
const DISPATCHABLE = ['accepted', 'preparing', 'ready_for_pickup'];

export default async function OrderDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string; error?: string }> }) {
  const admin = await requireAdmin('orders');
  const db = admin.supabase;
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  const { data: o } = await db
    .from('orders')
    .select('*, store:stores(name, phone, locality), customer:customers(profile:profiles(full_name, phone)), items:order_items(*), coupon:coupons(code)')
    .eq('id', id)
    .maybeSingle();
  if (!o) notFound();

  const [history, assignments, payments] = await Promise.all([
    db.from('order_status_history').select('id, from_status, to_status, created_at, note, actor:profiles(full_name, role)').eq('order_id', id).order('created_at'),
    db.from('delivery_assignments').select('id, status, offered_at, responded_at, picked_up_at, delivered_at, earning, partner:delivery_partners(id, vehicle_type, profile:profiles!delivery_partners_id_fkey(full_name, phone))').eq('order_id', id).order('offered_at'),
    db.from('payments').select('id, method, amount, status, paid_at, failure_reason, cash_settlement_id').eq('order_id', id),
  ]);
  const addr = o.delivery_address as Record<string, string>;
  const active = assignments.data?.find((a) => a.status === 'accepted' || a.status === 'picked_up');
  const canDispatch = roleCan(admin.role, 'deliveries') && DISPATCHABLE.includes(o.status);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/orders" className="text-forest hover:underline">
          ← Orders
        </Link>
      </p>
      <PageHeader title={o.order_number} description={`Placed ${ist(o.placed_at)}`} />
      <div className="mb-6 flex items-center gap-3">
        <StatusBadge status={o.status} />
        {o.is_demo && <span className="text-sm text-ink-2">Demo order</span>}
      </div>
      <ActionResult {...sp} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section title="Items">
            <Table head={['Item', 'Qty', 'Price', 'Line total']}>
              {o.items.map((it) => (
                <tr key={it.id} className="border-t border-line">
                  <td className="px-4 py-3">
                    {it.product_name} <span className="text-ink-2">· {it.variant_label}</span>
                  </td>
                  <td className="px-4 py-3">{it.quantity}</td>
                  <td className="px-4 py-3 tabular-nums">{inr(it.unit_price)}</td>
                  <td className="px-4 py-3 tabular-nums">{inr(it.line_total)}</td>
                </tr>
              ))}
            </Table>
            <dl className="mt-3 grid max-w-xs grid-cols-2 gap-y-1 text-sm">
              <dt className="text-ink-2">Subtotal</dt>
              <dd className="text-right tabular-nums">{inr(o.subtotal)}</dd>
              <dt className="text-ink-2">Delivery fee</dt>
              <dd className="text-right tabular-nums">{inr(o.delivery_fee)}</dd>
              {Number(o.discount) > 0 && (
                <>
                  <dt className="text-ink-2">Discount {o.coupon?.code && `(${o.coupon.code})`}</dt>
                  <dd className="text-right tabular-nums">−{inr(o.discount)}</dd>
                </>
              )}
              {Number(o.tax) > 0 && (
                <>
                  <dt className="text-ink-2">GST</dt>
                  <dd className="text-right tabular-nums">{inr(o.tax)}</dd>
                </>
              )}
              <dt className="font-bold">Total</dt>
              <dd className="text-right font-bold tabular-nums">{inr(o.total)}</dd>
            </dl>
          </Section>

          <Section title="Timeline">
            <ol className="space-y-2 text-sm">
              {history.data?.map((h) => (
                <li key={h.id} className="flex gap-3">
                  <span className="w-44 shrink-0 text-ink-2">{ist(h.created_at)}</span>
                  <span>
                    <StatusBadge status={h.to_status} />
                    {h.actor && (
                      <span className="ml-2 text-ink-2">
                        by {h.actor.full_name ?? 'unknown'} ({label(h.actor.role)})
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
            {o.rejection_reason && <p className="mt-3 text-sm text-bad">Rejected: {o.rejection_reason}</p>}
            {o.cancel_reason && <p className="mt-3 text-sm text-bad">Cancelled: {o.cancel_reason}</p>}
          </Section>

          <Section title="Delivery partners" count={assignments.data?.length}>
            {assignments.data?.length ? (
              <Table head={['Partner', 'Offer', 'Status', 'Picked up', 'Delivered', 'Earning']}>
                {assignments.data.map((a) => (
                  <tr key={a.id} className="border-t border-line">
                    <td className="px-4 py-3">
                      {a.partner?.profile?.full_name}
                      <div className="text-xs text-ink-2">
                        {a.partner?.profile?.phone} · {label(a.partner?.vehicle_type)}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{ist(a.offered_at, 'time')}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={a.status} />
                    </td>
                    <td className="px-4 py-3">{ist(a.picked_up_at, 'time')}</td>
                    <td className="px-4 py-3">{ist(a.delivered_at, 'time')}</td>
                    <td className="px-4 py-3 tabular-nums">{a.earning == null ? '—' : inr(a.earning)}</td>
                  </tr>
                ))}
              </Table>
            ) : (
              <p className="text-sm text-ink-2">No partner has been offered this order yet.</p>
            )}
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Customer">
            <div className="rounded-2xl border border-line bg-white p-5 text-sm">
              <p className="font-bold">{o.customer?.profile?.full_name ?? '—'}</p>
              <p>{o.customer?.profile?.phone}</p>
              <p className="mt-3 font-medium">{addr.contact_name}</p>
              <p className="text-ink-2">
                {[addr.line1, addr.line2, addr.landmark, addr.locality, addr.city, addr.pincode].filter(Boolean).join(', ')}
              </p>
              {o.delivery_instructions && <p className="mt-2 rounded bg-sunken p-2">“{o.delivery_instructions}”</p>}
            </div>
          </Section>
          <Section title="Shop">
            <div className="rounded-2xl border border-line bg-white p-5 text-sm">
              <p className="font-bold">{o.store?.name}</p>
              <p>{o.store?.phone}</p>
              <p className="text-ink-2">{o.store?.locality}</p>
              {o.prep_time_minutes && <p className="mt-2">Prep time: {o.prep_time_minutes} min</p>}
            </div>
          </Section>
          <Section title="Payment">
            <div className="rounded-2xl border border-line bg-white p-5 text-sm">
              {payments.data?.map((p) => (
                <div key={p.id}>
                  <p>
                    {label(p.method)} · {inr(p.amount)} · <StatusBadge status={p.status} />
                  </p>
                  {p.paid_at && <p className="text-ink-2">Paid {ist(p.paid_at)}</p>}
                  {p.method === 'cod' && p.status === 'paid' && (
                    <p className="text-ink-2">{p.cash_settlement_id ? 'Cash handed over by partner' : 'Cash still with the partner'}</p>
                  )}
                  {p.failure_reason && <p className="text-ink-2">{label(p.failure_reason)}</p>}
                </div>
              ))}
            </div>
          </Section>

          {canDispatch && (
            <Section title="Dispatch">
              <form action={redispatch} className="space-y-3 rounded-2xl border border-line bg-white p-5 text-sm">
                <input type="hidden" name="order_id" value={o.id} />
                <p className="text-ink-2">Sends new offers to the nearest free, online partners.</p>
                {active && (
                  <label className="flex items-start gap-2">
                    <input type="checkbox" name="release" className="mt-1 h-4 w-4" />
                    <span>
                      Take it away from <b>{active.partner?.profile?.full_name}</b> (accepted, not picked up yet)
                    </span>
                  </label>
                )}
                <button className={btnSecondary}>Send to partners again</button>
              </form>
            </Section>
          )}

          {OPEN.includes(o.status) && (
            <Section title="Cancel order">
              <form action={cancelOrder} className="space-y-3 rounded-2xl border border-bad bg-white p-5 text-sm">
                <input type="hidden" name="order_id" value={o.id} />
                <label className="block">
                  <span className="mb-1 block text-ink-2">Reason (shown to the customer and shop)</span>
                  <textarea name="reason" required minLength={5} maxLength={300} rows={2} className={`${inputCls} h-auto w-full py-2`} />
                </label>
                {o.status === 'picked_up' && (
                  <fieldset>
                    <legend className="mb-1 text-ink-2">The goods are with the partner. Put them back in stock?</legend>
                    <label className="mr-4">
                      <input type="radio" name="restock" value="yes" className="mr-1" />
                      Yes, returned to shop
                    </label>
                    <label>
                      <input type="radio" name="restock" value="no" defaultChecked className="mr-1" />
                      No
                    </label>
                  </fieldset>
                )}
                {o.payment_status === 'paid' && o.payment_method !== 'cod' && (
                  <p className="text-warn">This order was paid online. It will be marked refunded — issue the refund in the payment provider.</p>
                )}
                <button className={btnDanger}>Cancel order</button>
              </form>
            </Section>
          )}
        </div>
      </div>
    </>
  );
}
