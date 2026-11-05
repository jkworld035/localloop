// razorpay-webhook — signature-verified payment events (future gateway).
//
// Online payments are not enabled in this release (place_order refuses the
// 'razorpay' method). This endpoint is ready so that enabling them only needs
// the checkout flow: it verifies X-Razorpay-Signature (HMAC-SHA256 of the raw
// body with the webhook secret), stores every event once, and settles the
// matching payment row.
//
// Secrets: RAZORPAY_WEBHOOK_SECRET. Without it every request is refused.
import { adminClient, json } from '../_shared/supabase.ts';

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET');
  if (!secret) return json({ error: 'not_configured' }, 503);
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const raw = await req.text();
  const signature = req.headers.get('X-Razorpay-Signature') ?? '';
  if (!timingSafeEqual(await hmacHex(secret, raw), signature)) return json({ error: 'invalid_signature' }, 401);

  const event = JSON.parse(raw);
  const eventId = req.headers.get('X-Razorpay-Event-Id') ?? `${event.event}:${event.created_at}`;
  const db = adminClient();

  const { error: dupErr } = await db
    .from('payment_events')
    .insert({ provider: 'razorpay', event_id: eventId, event_type: event.event, payload: event });
  if (dupErr?.code === '23505') return json({ ok: true, duplicate: true }); // already processed
  if (dupErr) return json({ error: 'store_failed' }, 500);

  const payment = event?.payload?.payment?.entity;
  if (payment?.order_id && (event.event === 'payment.captured' || event.event === 'payment.failed')) {
    const captured = event.event === 'payment.captured';
    const { data: row } = await db
      .from('payments')
      .update({
        status: captured ? 'paid' : 'failed',
        provider_payment_id: payment.id,
        failure_reason: captured ? null : payment.error_description ?? 'payment_failed',
        paid_at: captured ? new Date().toISOString() : null,
      })
      .eq('provider_order_id', payment.order_id)
      .select('order_id')
      .maybeSingle();
    if (row?.order_id) {
      await db.from('orders').update({ payment_status: captured ? 'paid' : 'failed' }).eq('id', row.order_id);
    }
  }
  return json({ ok: true });
});
