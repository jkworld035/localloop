import { requireAdmin } from '@/lib/auth';
import { Badge, Empty, PageHeader, Section, Stat, Table } from '@/components/ui';
import { ago, label } from '@/lib/format';

export const metadata = { title: 'App health' };
export const dynamic = 'force-dynamic';

type Row = { message: string; screen: string | null; app_version: string; platform: string; role: string | null; is_fatal: boolean; created_at: string; stack: string | null };

/** Crashes and unexpected errors reported by the apps over the last 7 days, grouped by cause. */
export default async function HealthPage() {
  const { supabase } = await requireAdmin('orders');
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('client_errors')
    .select('message, screen, app_version, platform, role, is_fatal, created_at, stack')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(2000);
  const rows = (data ?? []) as Row[];

  const groups = new Map<string, { message: string; screen: string | null; count: number; fatal: number; last: string; versions: Set<string>; platforms: Set<string>; roles: Set<string>; stack: string | null }>();
  for (const r of rows) {
    const key = `${r.message}|${r.screen}`;
    const g = groups.get(key) ?? { message: r.message, screen: r.screen, count: 0, fatal: 0, last: r.created_at, versions: new Set(), platforms: new Set(), roles: new Set(), stack: r.stack };
    g.count++;
    if (r.is_fatal) g.fatal++;
    g.versions.add(r.app_version);
    g.platforms.add(r.platform);
    if (r.role) g.roles.add(r.role);
    groups.set(key, g);
  }
  const sorted = [...groups.values()].sort((a, b) => b.fatal - a.fatal || b.count - a.count);
  const fatal = rows.filter((r) => r.is_fatal).length;
  const today = rows.filter((r) => Date.now() - new Date(r.created_at).getTime() < 86_400_000).length;

  return (
    <>
      <PageHeader
        title="App health"
        description="Crashes and unexpected errors from customers', shops' and partners' phones in the last 7 days. Phone numbers are masked before saving; reports are deleted after 30 days."
      />
      {error && <p className="mb-6 text-bad">Couldn&apos;t load reports: {error.message}</p>}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Reports (7 days)" value={rows.length} />
        <Stat label="Last 24 hours" value={today} />
        <Stat label="Crashes" value={fatal} tone={fatal ? 'warn' : undefined} hint="The app showed the error screen" />
        <Stat label="Distinct problems" value={sorted.length} />
      </div>
      <Section title="Problems, worst first">
        {!sorted.length ? (
          <Empty>No errors reported in the last 7 days.</Empty>
        ) : (
          <Table head={['Problem', 'Where', 'Count', 'Who', 'Versions', 'Last seen']}>
            {sorted.map((g) => (
              <tr key={`${g.message}|${g.screen}`} className="border-t border-line align-top">
                <td className="max-w-md px-4 py-3">
                  {g.fatal > 0 && (
                    <span className="mr-2">
                      <Badge tone="bad">crash</Badge>
                    </span>
                  )}
                  <span className="font-mono text-xs break-words">{g.message}</span>
                  {g.stack && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-forest">Stack trace</summary>
                      <pre className="mt-1 max-h-60 overflow-auto rounded bg-sunken p-2 text-[11px] whitespace-pre-wrap">{g.stack}</pre>
                    </details>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-xs">{g.screen ?? '—'}</td>
                <td className="px-4 py-3 tabular-nums">
                  {g.count}
                  {g.fatal > 0 && <span className="text-bad"> ({g.fatal} crashes)</span>}
                </td>
                <td className="px-4 py-3 text-xs">
                  {[...g.roles].map(label).join(', ') || 'signed out'}
                  <br />
                  {[...g.platforms].join(', ')}
                </td>
                <td className="px-4 py-3 text-xs">{[...g.versions].join(', ')}</td>
                <td className="px-4 py-3 whitespace-nowrap">{ago(g.last)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </>
  );
}
