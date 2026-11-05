const inrFormatters = new Map<string, Intl.NumberFormat>();

/** ₹1,23,456.50 — Indian digit grouping. Whole rupees drop the decimals. */
export function formatINR(amount: number, locale: 'en' | 'te' = 'en'): string {
  const key = `${locale}:${Number.isInteger(amount)}`;
  let f = inrFormatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale === 'te' ? 'te-IN' : 'en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    });
    inrFormatters.set(key, f);
  }
  return f.format(amount);
}

/** 850 m / 2.4 km — one decimal under 10 km, whole km above. */
export function formatDistance(meters: number): { value: string; unit: 'm' | 'km' } {
  if (meters < 1000) return { value: String(Math.max(0, Math.round(meters / 10) * 10)), unit: 'm' };
  const km = meters / 1000;
  return { value: km < 10 ? km.toFixed(1) : String(Math.round(km)), unit: 'km' };
}

/** Whole minutes, never below 1 while a delivery is in progress. */
export function etaMinutes(arrivalAt: Date, now: Date = new Date()): number {
  return Math.max(1, Math.ceil((arrivalAt.getTime() - now.getTime()) / 60000));
}

export function ageSeconds(timestamp: string | Date, now: Date = new Date()): number {
  const t = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  return Math.max(0, Math.round((now.getTime() - t.getTime()) / 1000));
}
