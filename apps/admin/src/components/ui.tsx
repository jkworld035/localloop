export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header className="mb-8">
      <h1 className="text-2xl font-bold">{title}</h1>
      {description && <p className="mt-1 text-ink-2">{description}</p>}
    </header>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: string | number; hint?: string; tone?: 'warn' }) {
  return (
    <div className={`rounded-2xl border bg-white p-5 ${tone === 'warn' ? 'border-amber' : 'border-line'}`}>
      <p className="text-sm text-ink-2">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums text-forest">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-2">{hint}</p>}
    </div>
  );
}

export function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-lg font-bold">
        {title}
        {count !== undefined && <span className="ml-2 rounded-full bg-sunken px-2 py-0.5 text-sm text-ink-2">{count}</span>}
      </h2>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-line bg-white p-6 text-center text-ink-2">{children}</p>;
}

export function Notice({ tone, children }: { tone: 'ok' | 'bad'; children: React.ReactNode }) {
  return (
    <p role={tone === 'bad' ? 'alert' : 'status'} className={`mb-6 rounded-lg px-4 py-3 text-sm ${tone === 'ok' ? 'bg-ok-bg text-ok' : 'bg-bad-bg text-bad'}`}>
      {children}
    </p>
  );
}

const BADGE_TONES = {
  ok: 'bg-ok-bg text-ok',
  warn: 'bg-warn-bg text-warn',
  bad: 'bg-bad-bg text-bad',
  info: 'bg-sunken text-ink',
} as const;

export function Badge({ tone = 'info', children }: { tone?: keyof typeof BADGE_TONES; children: React.ReactNode }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${BADGE_TONES[tone]}`}>{children}</span>;
}

const STATUS_TONE: Record<string, keyof typeof BADGE_TONES> = {
  awaiting_payment: 'warn',
  placed: 'warn',
  accepted: 'info',
  preparing: 'info',
  ready_for_pickup: 'info',
  picked_up: 'info',
  delivered: 'ok',
  cancelled: 'bad',
  rejected: 'bad',
  approved: 'ok',
  pending: 'warn',
  suspended: 'bad',
  published: 'ok',
  hidden: 'bad',
  under_review: 'warn',
  open: 'warn',
  in_progress: 'info',
  resolved: 'ok',
  closed: 'info',
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? 'info'}>{status.replaceAll('_', ' ')}</Badge>;
}

/** A white, rounded, horizontally scrollable table shell. */
export function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-sunken text-ink-2">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export const inputCls = 'h-10 rounded-lg border border-line bg-white px-3 text-sm';
export const btnPrimary = 'h-10 rounded-lg bg-forest px-4 text-sm font-medium text-white hover:bg-green';
export const btnSecondary = 'h-10 rounded-lg border border-forest px-4 text-sm font-medium text-forest hover:bg-sunken';
export const btnDanger = 'h-10 rounded-lg border border-bad px-4 text-sm font-medium text-bad hover:bg-bad-bg';

/** Result banner from ?done= / ?error= query params after a Server Action redirect. */
export function ActionResult({ done, error }: { done?: string; error?: string }) {
  if (error) return <Notice tone="bad">{error}</Notice>;
  if (done) return <Notice tone="ok">{done}</Notice>;
  return null;
}
