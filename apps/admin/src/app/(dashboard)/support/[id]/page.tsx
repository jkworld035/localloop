import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { ActionResult, btnPrimary, inputCls, PageHeader, StatusBadge } from '@/components/ui';
import { ist, label } from '@/lib/format';
import { replyTicket } from '../actions';

export const metadata = { title: 'Support ticket' };
export const dynamic = 'force-dynamic';

export default async function TicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string; error?: string }> }) {
  const { supabase } = await requireAdmin('tickets');
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { data: t } = await supabase
    .from('support_tickets')
    .select('*, user:profiles!support_tickets_user_id_fkey(full_name, phone, role, preferred_language), order:orders(id, order_number, status)')
    .eq('id', id)
    .maybeSingle();
  if (!t) notFound();
  const { data: messages } = await supabase
    .from('support_messages')
    .select('id, body, is_staff, created_at, author:profiles(full_name)')
    .eq('ticket_id', id)
    .order('created_at');

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/support" className="text-forest hover:underline">
          ← Support
        </Link>
      </p>
      <PageHeader title={t.subject} description={`${label(t.category)} · ${t.priority} priority · opened ${ist(t.created_at)}`} />
      <div className="mb-6 flex flex-wrap items-center gap-3 text-sm">
        <StatusBadge status={t.status} />
        <span>
          {t.user?.full_name} · {t.user?.phone} · {label(t.user?.role)} · writes in {t.user?.preferred_language === 'te' ? 'Telugu' : 'English'}
        </span>
        {t.order && (
          <Link href={`/orders/${t.order.id}`} className="font-medium text-forest hover:underline">
            Order {t.order.order_number} ({label(t.order.status)})
          </Link>
        )}
      </div>
      <ActionResult {...sp} />
      <ol className="mb-8 space-y-3">
        {messages?.map((m) => (
          <li key={m.id} className={`max-w-2xl rounded-2xl p-4 ${m.is_staff ? 'ml-auto bg-forest text-white' : 'border border-line bg-white'}`}>
            <p className="whitespace-pre-wrap">{m.body}</p>
            <p className={`mt-2 text-xs ${m.is_staff ? 'text-white/80' : 'text-ink-2'}`}>
              {m.is_staff ? `${m.author?.full_name ?? 'Staff'} (LocalLoop)` : (m.author?.full_name ?? 'User')} · {ist(m.created_at)}
            </p>
          </li>
        ))}
        {!messages?.length && <li className="text-ink-2">No messages yet.</li>}
      </ol>
      <form action={replyTicket} className="max-w-2xl space-y-3 rounded-2xl border border-line bg-white p-5">
        <input type="hidden" name="ticket_id" value={t.id} />
        <label className="block">
          <span className="mb-1 block text-sm text-ink-2">Reply</span>
          <textarea name="body" rows={4} maxLength={4000} className={`${inputCls} h-auto w-full py-2`} />
        </label>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-2">Status after sending</span>
            <select name="status" defaultValue="" className={inputCls}>
              <option value="">{t.status === 'open' ? 'In progress (default)' : `Keep (${label(t.status)})`}</option>
              <option value="in_progress">In progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </label>
          <button className={btnPrimary}>Send</button>
        </div>
      </form>
    </>
  );
}
