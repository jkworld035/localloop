// Razorpay helpers shared by the payment functions. Pure functions are unit
// tested (razorpay.test.ts); network calls take the credentials explicitly.

export const RAZORPAY_API = 'https://api.razorpay.com/v1';

/** Rupees (2-decimal numeric from Postgres) → integer paise, without float drift. */
export function toPaise(rupees: number | string): number {
  const text = String(rupees).trim();
  if (!/^\d+(\.\d+)?$/.test(text)) throw new Error(`invalid amount: ${text}`);
  const [whole, frac = ''] = text.split('.');
  return Number(whole) * 100 + Number((frac + '00').slice(0, 2));
}

/** Razorpay needs a link to live at least 15 minutes; we keep 16 for clock skew. */
export function linkExpiry(windowEndsAt: Date, now = new Date()): number {
  const min = now.getTime() + 16 * 60_000;
  return Math.floor(Math.max(windowEndsAt.getTime(), min) / 1000);
}

export interface LinkInput {
  orderId: string;
  orderNumber: string;
  amountPaise: number;
  storeName: string;
  customerName: string | null;
  customerPhone: string | null;
  expireBy: number;
  callbackUrl?: string | null;
  attempt: string;
}

export function paymentLinkBody(i: LinkInput) {
  return {
    amount: i.amountPaise,
    currency: 'INR',
    accept_partial: false,
    // Unique per attempt; the order number keeps it readable in the Razorpay dashboard.
    reference_id: `${i.orderNumber}-${i.attempt}`.slice(0, 40),
    description: `LocalLoop order ${i.orderNumber} · ${i.storeName}`.slice(0, 2048),
    customer: {
      ...(i.customerName ? { name: i.customerName } : {}),
      ...(i.customerPhone ? { contact: i.customerPhone } : {}),
    },
    notify: { sms: false, email: false },
    reminder_enable: false,
    expire_by: i.expireBy,
    notes: { order_id: i.orderId, order_number: i.orderNumber },
    ...(i.callbackUrl ? { callback_url: `${i.callbackUrl}?order=${i.orderId}`, callback_method: 'get' } : {}),
  };
}

export function basicAuth(keyId: string, keySecret: string) {
  return 'Basic ' + btoa(`${keyId}:${keySecret}`);
}

export async function razorpay<T>(path: string, init: { method?: string; body?: unknown }, keyId: string, keySecret: string): Promise<T> {
  const res = await fetch(`${RAZORPAY_API}${path}`, {
    method: init.method ?? 'GET',
    headers: { Authorization: basicAuth(keyId, keySecret), 'Content-Type': 'application/json' },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as { error?: { description?: string } }).error?.description ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

export async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
