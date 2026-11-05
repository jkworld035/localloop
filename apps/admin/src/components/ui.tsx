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
