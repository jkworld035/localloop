// razorpay-refund — returns online payments for orders that were closed.
//
// Triggered by the database whenever a payment's refund_status becomes
// 'requested' ({ payment_id }), and by a 10-minute sweep (empty body) that
// retries anything left behind. Service-role only. Each row is claimed
// (requested → processing) before calling Razorpay, so two runs never refund
// twice; a payment Razorpay already refunded is just marked done.
// Secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET.
import { razorpay, toPaise } from '../_shared/razorpay.ts';
import { adminClient, isServiceRequest, json } from '../_shared/supabase.ts';

interface Row {
  id: string;
  order_id: string;
  amount: string;
  provider_payment_id: string | null;
}

Deno.serve(async (req) => {
  if (!isServiceRequest(req)) return json({ error: 'forbidden' }, 403);
  const keyId = Deno.env.get('RAZORPAY_KEY_ID');
  const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET');
  if (!keyId || !keySecret) return json({ error: 'not_configured' }, 503);

  let paymentId: string | undefined;
  try {
    paymentId = (await req.json())?.payment_id;
  } catch {
    /* sweep */
  }
  const db = adminClient();

  // Stuck claims (a run that died mid-way) become requestable again after 10 minutes.
  await db
    .from('payments')
    .update({ refund_status: 'requested' })
    .eq('refund_status', 'processing')
    .lt('updated_at', new Date(Date.now() - 10 * 60_000).toISOString());

  let claim = db.from('payments').update({ refund_status: 'processing' }).eq('refund_status', 'requested').eq('method', 'razorpay');
  if (paymentId) claim = claim.eq('id', paymentId);
  const { data: rows, error } = await claim.select('id, order_id, amount, provider_payment_id');
  if (error) return json({ error: 'claim_failed' }, 500);

  let done = 0;
  for (const p of (rows ?? []) as Row[]) {
    try {
      if (!p.provider_payment_id) throw new Error('no Razorpay payment id on record');
      const amount = toPaise(p.amount);
      const current = await razorpay<{ amount: number; amount_refunded: number }>(`/payments/${p.provider_payment_id}`, {}, keyId, keySecret);
      let refundId: string | null = null;
      if (current.amount_refunded < amount) {
        const refund = await razorpay<{ id: string }>(
          `/payments/${p.provider_payment_id}/refund`,
          { method: 'POST', body: { amount: amount - current.amount_refunded, speed: 'normal', notes: { order_id: p.order_id } } },
          keyId,
          keySecret,
        );
        refundId = refund.id;
      }
      await db
        .from('payments')
        .update({ status: 'refunded', refund_status: 'processed', refund_id: refundId, refunded_at: new Date().toISOString(), refund_error: null })
        .eq('id', p.id);
      await db.from('orders').update({ payment_status: 'refunded' }).eq('id', p.order_id);
      done++;
    } catch (e) {
      console.error('razorpay-refund failed', p.id, (e as Error).message);
      await db.from('payments').update({ refund_status: 'failed', refund_error: (e as Error).message.slice(0, 300) }).eq('id', p.id);
    }
  }
  return json({ refunded: done, attempted: rows?.length ?? 0 });
});
