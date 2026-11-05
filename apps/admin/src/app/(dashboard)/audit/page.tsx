import { requireAdmin } from '@/lib/auth';
import { Empty, Notice, PageHeader } from '@/components/ui';

export const metadata = { title: 'Audit log' };
export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  const { supabase } = await requireAdmin('audit');
  const { data, error } = await supabase
    .from('admin_audit_logs')
    .select('id, action, entity_type, entity_id, created_at, admin:profiles!admin_audit_logs_admin_id_fkey(full_name, email)')
    .order('created_at', { ascending: false })
    .limit(200);

  return (
    <>
      <PageHeader title="Audit log" description="Every change an administrator makes, most recent first (latest 200)." />
      {error && <Notice tone="bad">Couldn&apos;t load the audit log: {error.message}</Notice>}
      {!data?.length ? (
        <Empty>No admin activity yet.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-sunken text-ink-2">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">When (IST)</th>
                <th scope="col" className="px-4 py-3 font-medium">Admin</th>
                <th scope="col" className="px-4 py-3 font-medium">Action</th>
                <th scope="col" className="px-4 py-3 font-medium">Record</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                    {new Date(r.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                  </td>
                  <td className="px-4 py-3">{r.admin?.full_name ?? r.admin?.email ?? '—'}</td>
                  <td className="px-4 py-3 font-medium">{r.action}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {r.entity_type} {r.entity_id}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
