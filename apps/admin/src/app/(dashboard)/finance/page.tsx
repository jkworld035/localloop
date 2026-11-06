import { requireAdmin, roleCan } from '@/lib/auth';
import { ActionResult, btnPrimary, Empty, inputCls, PageHeader, Section, Table } from '@/components/ui';
import { inr, ist } from '@/lib/format';
import { recordVendorPayout, settlePartnerCash } from './actions';

export const metadata = { title: 'Finance' };
export const dynamic = 'force-dynamic';

type Balances = {
  partners: { partner_id: string; name: string; phone: string; amount: number; payments: number; oldest: string }[];
  vendors: { vendor_id: string; business_name: string; phone: string; amount: number; commission: number; orders: number; oldest: string }[];
};

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  const admin = await requireAdmin();
  const canCash = roleCan(admin.role, 'payments');
  const canPayouts = roleCan(admin.role, 'commissions');
  if (!canCash && !canPayouts) return <PageHeader title="Finance" description="Your role has no finance access." />;
  const db = admin.supabase;
  const sp = await searchParams;
  const { data, error } = await db.rpc('admin_balances');
  const b = (data ?? { partners: [], vendors: [] }) as unknown as Balances;
  const [settlements, payouts] = await Promise.all([
    canCash
      ? db.from('partner_cash_settlements').select('id, amount, payment_count, note, created_at, partner:delivery_partners(profile:profiles!delivery_partners_id_fkey(full_name))').order('created_at', { ascending: false }).limit(20)
      : null,
    canPayouts ? db.from('vendor_payouts').select('id, amount, order_count, reference, created_at, vendor:vendors(business_name)').order('created_at', { ascending: false }).limit(20) : null,
  ]);

  return (
    <>
      <PageHeader
        title="Finance"
        description="Cash-on-delivery money held by partners, and what LocalLoop owes each shop for delivered orders (after commission). Record each hand-over and transfer here."
      />
      <ActionResult {...sp} />
      {error && <ActionResult error={error.message} />}

      {canCash && (
        <Section title="Cash with delivery partners" count={b.partners.length}>
          {!b.partners.length ? (
            <Empty>No cash outstanding.</Empty>
          ) : (
            <Table head={['Partner', 'Cash held', 'Orders', 'Since', 'Record hand-over']}>
              {b.partners.map((p) => (
                <tr key={p.partner_id} className="border-t border-line align-top">
                  <td className="px-4 py-3">
                    {p.name}
                    <p className="text-xs text-ink-2">{p.phone}</p>
                  </td>
                  <td className="px-4 py-3 text-lg font-bold tabular-nums">{inr(p.amount)}</td>
                  <td className="px-4 py-3">{p.payments}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{ist(p.oldest, 'date')}</td>
                  <td className="px-4 py-3">
                    <form action={settlePartnerCash} className="flex flex-wrap gap-2">
                      <input type="hidden" name="partner_id" value={p.partner_id} />
                      <input type="hidden" name="expected" value={p.amount} />
                      <input name="note" placeholder="Note (optional)" maxLength={300} aria-label={`Note for ${p.name}`} className={`${inputCls} w-40`} />
                      <button className={btnPrimary}>Received {inr(p.amount)}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Section>
      )}

      {canPayouts && (
        <Section title="Owed to shops" count={b.vendors.length}>
          {!b.vendors.length ? (
            <Empty>Nothing owed.</Empty>
          ) : (
            <Table head={['Shop owner', 'To pay', 'Commission kept', 'Orders', 'Since', 'Record transfer']}>
              {b.vendors.map((v) => (
                <tr key={v.vendor_id} className="border-t border-line align-top">
                  <td className="px-4 py-3">
                    {v.business_name}
                    <p className="text-xs text-ink-2">{v.phone}</p>
                  </td>
                  <td className="px-4 py-3 text-lg font-bold tabular-nums">{inr(v.amount)}</td>
                  <td className="px-4 py-3 tabular-nums">{inr(v.commission)}</td>
                  <td className="px-4 py-3">{v.orders}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{ist(v.oldest, 'date')}</td>
                  <td className="px-4 py-3">
                    <form action={recordVendorPayout} className="flex flex-wrap gap-2">
                      <input type="hidden" name="vendor_id" value={v.vendor_id} />
                      <input type="hidden" name="expected" value={v.amount} />
                      <input name="reference" required minLength={4} maxLength={60} placeholder="UTR / UPI ref" aria-label={`Transfer reference for ${v.business_name}`} className={`${inputCls} w-40`} />
                      <button className={btnPrimary}>Paid {inr(v.amount)}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </Table>
          )}
          <p className="mt-2 text-xs text-ink-2">Make the bank/UPI transfer first, then record it here with the reference.</p>
        </Section>
      )}

      {settlements?.data && settlements.data.length > 0 && (
        <Section title="Recent cash hand-overs">
          <Table head={['When', 'Partner', 'Amount', 'Orders', 'Note']}>
            {settlements.data.map((s) => (
              <tr key={s.id} className="border-t border-line">
                <td className="px-4 py-3 whitespace-nowrap">{ist(s.created_at)}</td>
                <td className="px-4 py-3">{s.partner?.profile?.full_name}</td>
                <td className="px-4 py-3 tabular-nums">{inr(s.amount)}</td>
                <td className="px-4 py-3">{s.payment_count}</td>
                <td className="px-4 py-3 text-ink-2">{s.note}</td>
              </tr>
            ))}
          </Table>
        </Section>
      )}
      {payouts?.data && payouts.data.length > 0 && (
        <Section title="Recent payouts to shops">
          <Table head={['When', 'Shop owner', 'Amount', 'Orders', 'Reference']}>
            {payouts.data.map((p) => (
              <tr key={p.id} className="border-t border-line">
                <td className="px-4 py-3 whitespace-nowrap">{ist(p.created_at)}</td>
                <td className="px-4 py-3">{p.vendor?.business_name}</td>
                <td className="px-4 py-3 tabular-nums">{inr(p.amount)}</td>
                <td className="px-4 py-3">{p.order_count}</td>
                <td className="px-4 py-3 font-mono text-xs">{p.reference}</td>
              </tr>
            ))}
          </Table>
        </Section>
      )}
    </>
  );
}
