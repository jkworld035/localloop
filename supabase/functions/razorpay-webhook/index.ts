// razorpay-webhook — the only place that decides an online payment succeeded.
//
// Razorpay signs each event (X-Razorpay-Signature = HMAC-SHA256 of the raw
// body with the webhook secret). Every event is stored once (payment_events),
// so retries are harmless. On payment_link.paid the order is confirmed in the
// database; money that arrives for a closed order, or a wrong amount, is
// queued for an automatic refund.
//
// In the Razorpay dashboard: Settings → Webhooks → URL
// https://<project>.supabase.co/functions/v1/razorpay-webhook, events
// payment_link.paid (and optionally refund.processed / refund.failed).
// Secrets: RAZORPAY_WEBHOOK_SECRET.
import { hmacSha256Hex, timingSafeEqual } from '../_shared/razorpay.ts';
import { adminClient, json } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const secret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET');
  if (!secret) return json({ error: 'not_configured' }, 503);
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const raw = await req.text();
  const signature = req.headers.get('X-Razorpay-Signature') ?? '';
  if (!timingSafeEqual(await hmacSha256Hex(secret, raw), signature)) return json({ error: 'invalid_signature' }, 401);

  const event = JSON.parse(raw);
  const eventId = req.headers.get('X-Razorpay-Event-Id') ?? `${event.event}:${event.created_at}`;
  const db = adminClient();

  const { error: dupErr } = await db
    .from('payment_events')
    .insert({ provider: 'razorpay', event_id: eventId, event_type: event.event, payload: event });
  if (dupErr?.code === '23505') return json({ ok: true, duplicate: true });
  if (dupErr) return json({ error: 'store_failed' }, 500);

  if (event.event === 'payment_link.paid') {
    const link = event.payload?.payment_link?.entity;
    const payment = event.payload?.payment?.entity;
    if (!link?.id || !payment?.id) return json({ ok: true, ignored: 'incomplete' });
    const { data: result, error } = await db.rpc('confirm_online_payment', {
      p_link_id: link.id,
      p_payment_id: payment.id,
      p_amount_paise: payment.amount,
    });
    if (error) {
      console.error('razorpay-webhook: confirm failed', link.id, error.message);
      // Let Razorpay retry: forget the event so the retry is processed.
      await db.from('payment_events').delete().eq('provider', 'razorpay').eq('event_id', eventId);
      return json({ error: 'confirm_failed' }, 500);
    }
    return json({ ok: true, result });
  }

  if (event.event === 'refund.failed') {
    const refund = event.payload?.refund?.entity;
    if (refund?.id) {
      await db.from('payments').update({ refund_status: 'failed', refund_error: refund.error_description ?? 'refund_failed' }).eq('refund_id', refund.id);
    }
  }
  return json({ ok: true });
});
