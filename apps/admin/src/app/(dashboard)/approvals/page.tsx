import { requireAdmin, roleCan } from '@/lib/auth';
import { Empty, Notice, PageHeader, Section } from '@/components/ui';
import { decide } from './actions';

export const metadata = { title: 'Approvals' };
export const dynamic = 'force-dynamic';

function DecisionForm({ kind, id }: { kind: 'vendors' | 'stores' | 'delivery_partners'; id: string }) {
  return (
    <form action={decide} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <label className="flex-1 min-w-48">
        <span className="sr-only">Reason (required to reject)</span>
        <input
          name="reason"
          placeholder="Reason (required to reject)"
          maxLength={300}
          className="h-10 w-full rounded-lg border border-line px-3 text-sm"
        />
      </label>
      <button name="status" value="approved" className="h-10 rounded-lg bg-forest px-4 text-sm font-medium text-white hover:bg-green">
        Approve
      </button>
      <button name="status" value="rejected" className="h-10 rounded-lg border border-bad px-4 text-sm font-medium text-bad hover:bg-bad-bg">
        Reject
      </button>
    </form>
  );
}

function Row({ title, lines, children }: { title: string; lines: (string | null | undefined)[]; children: React.ReactNode }) {
  return (
    <li className="space-y-3 rounded-2xl border border-line bg-white p-5">
      <div>
        <p className="font-bold">{title}</p>
        {lines.filter(Boolean).map((l, i) => (
          <p key={i} className="text-sm text-ink-2">
            {l}
          </p>
        ))}
      </div>
      {children}
    </li>
  );
}

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  const admin = await requireAdmin('vendors');
  const { done, error } = await searchParams;
  const db = admin.supabase;

  const [vendors, stores, partners] = await Promise.all([
    db
      .from('vendors')
      .select('id, owner_name, business_name, gstin, created_at, status_reason, profile:profiles!vendors_id_fkey(phone), category:categories(name_en), documents:vendor_documents(id, doc_type, status)')
      .eq('status', 'pending')
      .order('created_at'),
    roleCan(admin.role, 'stores')
      ? db
          .from('stores')
          .select('id, name, locality, city, pincode, created_at, status_reason, serviceable_area_id, vendor:vendors(business_name, status)')
          .eq('status', 'pending')
          .order('created_at')
      : Promise.resolve({ data: [], error: null }),
    roleCan(admin.role, 'partners')
      ? db
          .from('delivery_partners')
          .select('id, vehicle_type, vehicle_registration, driving_licence, created_at, profile:profiles!delivery_partners_id_fkey(full_name, phone), documents:delivery_documents(id, doc_type, status)')
          .eq('status', 'pending')
          .order('created_at')
      : Promise.resolve({ data: [], error: null }),
  ]);
  const loadError = vendors.error ?? stores.error ?? partners.error;
  const date = (s: string) => new Date(s).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

  return (
    <>
      <PageHeader title="Approvals" description="Check documents before approving. Rejections and suspensions require a reason, which the applicant sees." />
      {done && <Notice tone="ok">Saved — status set to {done}. The applicant has been notified.</Notice>}
      {error && <Notice tone="bad">{error === 'reason' ? 'Give a reason (at least 5 characters) to reject.' : `Couldn't save: ${error}`}</Notice>}
      {loadError && <Notice tone="bad">Couldn&apos;t load applications: {loadError.message}</Notice>}

      <Section title="Vendors" count={vendors.data?.length ?? 0}>
        {vendors.data?.length ? (
          <ul className="space-y-3">
            {vendors.data.map((v) => (
              <Row
                key={v.id}
                title={v.business_name}
                lines={[
                  `${v.owner_name} · ${v.profile?.phone ?? ''}`,
                  `${v.category?.name_en ?? 'No category'} · GSTIN: ${v.gstin ?? 'not registered'}`,
                  `Documents: ${v.documents.length ? v.documents.map((d) => `${d.doc_type} (${d.status})`).join(', ') : 'none uploaded'}`,
                  `Applied ${date(v.created_at)}`,
                ]}
              >
                <DecisionForm kind="vendors" id={v.id} />
              </Row>
            ))}
          </ul>
        ) : (
          <Empty>No vendors waiting.</Empty>
        )}
      </Section>

      {roleCan(admin.role, 'stores') && (
        <Section title="Shops" count={stores.data?.length ?? 0}>
          {stores.data?.length ? (
            <ul className="space-y-3">
              {stores.data.map((s) => (
                <Row
                  key={s.id}
                  title={s.name}
                  lines={[
                    `${s.vendor?.business_name ?? ''} (vendor ${s.vendor?.status ?? '?'})`,
                    `${s.locality}, ${s.city} ${s.pincode}`,
                    s.serviceable_area_id ? null : '⚠ Outside every serviceable area — it will stay hidden even if approved.',
                    s.status_reason,
                    `Submitted ${date(s.created_at)}`,
                  ]}
                >
                  <DecisionForm kind="stores" id={s.id} />
                </Row>
              ))}
            </ul>
          ) : (
            <Empty>No shops waiting.</Empty>
          )}
        </Section>
      )}

      {roleCan(admin.role, 'partners') && (
        <Section title="Delivery partners" count={partners.data?.length ?? 0}>
          {partners.data?.length ? (
            <ul className="space-y-3">
              {partners.data.map((p) => (
                <Row
                  key={p.id}
                  title={p.profile?.full_name ?? 'Unnamed'}
                  lines={[
                    `${p.profile?.phone ?? ''} · ${p.vehicle_type}${p.vehicle_registration ? ` · ${p.vehicle_registration}` : ''}`,
                    p.driving_licence ? `DL ${p.driving_licence}` : 'No licence required (bicycle)',
                    `Documents: ${p.documents.length ? p.documents.map((d) => `${d.doc_type} (${d.status})`).join(', ') : 'none uploaded'}`,
                    `Applied ${date(p.created_at)}`,
                  ]}
                >
                  <DecisionForm kind="delivery_partners" id={p.id} />
                </Row>
              ))}
            </ul>
          ) : (
            <Empty>No partners waiting.</Empty>
          )}
        </Section>
      )}
    </>
  );
}
