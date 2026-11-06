import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { Empty, PageHeader, StatusBadge, Table } from '@/components/ui';
import { ago, label } from '@/lib/format';

export const metadata = { title: 'Support' };
export const dynamic = 'force-dynamic';

const FILTERS = [
  { key: 'active', label: 'Needs action', statuses: ['open', 'in_progress'] },
  { key: 'resolved', label: 'Resolved', statuses: ['resolved'] },
  { key: 'closed', label: 'Closed', statuses: ['closed'] },
] as const;

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { supabase } = await requireAdmin('tickets');
  const { f } = await searchParams;
  const filter = FILTERS.find((x) => x.key === f) ?? FILTERS[0];
  const { data } = await supabase
    .from('support_tickets')
    .select('id, subject, category, status, priority, updated_at, created_at, user:profiles!support_tickets_user_id_fkey(full_name, phone, role), order:orders(order_number)')
    .in('status', [...filter.statuses])
    .order('priority', { ascending: false })
    .order('updated_at', { ascending: true })
    .limit(200);

  return (
    <>
      <PageHeader title="Support" description="Help requests from customers, shops and partners. Oldest waiting first within each priority." />
      <nav aria-label="Ticket status" className="mb-4 flex gap-2">
        {FILTERS.map((x) => (
          <Link
            key={x.key}
            href={`/support?f=${x.key}`}
            aria-current={x.key === filter.key ? 'page' : undefined}
            className={`rounded-full px-4 py-2 text-sm font-medium ${x.key === filter.key ? 'bg-forest text-white' : 'bg-white hover:bg-sunken'}`}
          >
            {x.label}
          </Link>
        ))}
      </nav>
      {!data?.length ? (
        <Empty>No tickets here.</Empty>
      ) : (
        <Table head={['Subject', 'From', 'Topic', 'Priority', 'Status', 'Updated']}>
          {data.map((t) => (
            <tr key={t.id} className="border-t border-line">
              <td className="px-4 py-3">
                <Link href={`/support/${t.id}`} className="font-medium text-forest hover:underline">
                  {t.subject}
                </Link>
                {t.order && <p className="text-xs text-ink-2">{t.order.order_number}</p>}
              </td>
              <td className="px-4 py-3">
                {t.user?.full_name ?? '—'}
                <p className="text-xs text-ink-2">
                  {t.user?.phone} · {label(t.user?.role)}
                </p>
              </td>
              <td className="px-4 py-3 capitalize">{t.category}</td>
              <td className={`px-4 py-3 capitalize ${t.priority === 'urgent' || t.priority === 'high' ? 'font-bold text-bad' : ''}`}>{t.priority}</td>
              <td className="px-4 py-3">
                <StatusBadge status={t.status} />
              </td>
              <td className="px-4 py-3 whitespace-nowrap">{ago(t.updated_at)}</td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
