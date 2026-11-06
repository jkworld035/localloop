import { formatINR } from '@localloop/shared';

export const inr = (v: number | string | null | undefined) => formatINR(Number(v ?? 0));

/** Date and time in India Standard Time, e.g. "6 Nov 2026, 4:05 pm". */
export function ist(v: string | null | undefined, style: 'datetime' | 'date' | 'time' = 'datetime') {
  if (!v) return '—';
  const d = new Date(v);
  const opts: Intl.DateTimeFormatOptions =
    style === 'date' ? { dateStyle: 'medium' } : style === 'time' ? { timeStyle: 'short' } : { dateStyle: 'medium', timeStyle: 'short' };
  return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', ...opts });
}

export function ago(v: string | null | undefined, now = Date.now()) {
  if (!v) return 'never';
  const s = Math.max(0, Math.round((now - new Date(v).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export const label = (v: string | null | undefined) => (v ? v.replaceAll('_', ' ') : '—');
