import { requireAdmin } from '@/lib/auth';
import { ActionResult, btnDanger, btnSecondary, Empty, PageHeader, Section, StatusBadge } from '@/components/ui';
import { ist, label } from '@/lib/format';
import { moderate } from './actions';

export const metadata = { title: 'Reviews' };
export const dynamic = 'force-dynamic';

const SELECT =
  'id, target, rating, body, status, report_count, created_at, author:profiles!reviews_author_id_fkey(full_name), store:stores(name), product:products(name), partner:delivery_partners(profile:profiles!delivery_partners_id_fkey(full_name)), order:orders(order_number)';

type Review = {
  id: string;
  target: string;
  rating: number;
  body: string;
  status: string;
  report_count: number;
  created_at: string;
  author: { full_name: string | null } | null;
  store: { name: string } | null;
  product: { name: string } | null;
  partner: { profile: { full_name: string | null } | null } | null;
  order: { order_number: string } | null;
};

function ReviewCard({ r }: { r: Review }) {
  const about = r.target === 'store' ? r.store?.name : r.target === 'product' ? r.product?.name : r.partner?.profile?.full_name;
  return (
    <li className="rounded-2xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-bold text-amber" aria-label={`${r.rating} out of 5`}>
          {'★'.repeat(r.rating)}
          <span className="text-line">{'★'.repeat(5 - r.rating)}</span>
        </span>
        <span className="font-medium">
          {label(r.target)}: {about ?? '—'}
        </span>
        <StatusBadge status={r.status} />
        {r.report_count > 0 && <span className="text-xs text-bad">Reported {r.report_count}×</span>}
      </div>
      <p className="mt-2 whitespace-pre-wrap">{r.body || <span className="text-ink-2">(no text)</span>}</p>
      <p className="mt-2 text-xs text-ink-2">
        {r.author?.full_name ?? 'Customer'} · {r.order?.order_number} · {ist(r.created_at)}
      </p>
      <form action={moderate} className="mt-3 flex gap-2">
        <input type="hidden" name="id" value={r.id} />
        {r.status !== 'hidden' && (
          <button name="status" value="hidden" className={btnDanger}>
            Hide
          </button>
        )}
        {r.status !== 'published' && (
          <button name="status" value="published" className={btnSecondary}>
            Publish
          </button>
        )}
      </form>
    </li>
  );
}

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  const { supabase } = await requireAdmin('reviews');
  const sp = await searchParams;
  const [flagged, recent] = await Promise.all([
    supabase.from('reviews').select(SELECT).eq('status', 'under_review').order('report_count', { ascending: false }),
    supabase.from('reviews').select(SELECT).neq('status', 'under_review').order('created_at', { ascending: false }).limit(50),
  ]);

  return (
    <>
      <PageHeader title="Reviews" description="Reviews reported by several customers are held here until you decide. Hiding a review removes it from the shop or partner rating." />
      <ActionResult {...sp} />
      <Section title="Needs a decision" count={flagged.data?.length ?? 0}>
        {flagged.data?.length ? <ul className="space-y-3">{(flagged.data as unknown as Review[]).map((r) => <ReviewCard key={r.id} r={r} />)}</ul> : <Empty>Nothing reported.</Empty>}
      </Section>
      <Section title="Latest reviews">
        {recent.data?.length ? <ul className="space-y-3">{(recent.data as unknown as Review[]).map((r) => <ReviewCard key={r.id} r={r} />)}</ul> : <Empty>No reviews yet.</Empty>}
      </Section>
    </>
  );
}
