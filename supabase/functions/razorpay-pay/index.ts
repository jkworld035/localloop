// razorpay-pay — returns a Razorpay payment page for one of the caller's
// orders that is waiting for online payment.
//
// Creates (once) a Razorpay Payment Link for the exact order total and stores
// it on the payment row; calling again returns the same link. The app opens it
// in the browser (UPI apps, cards, netbanking). Whether the money arrived is
// decided only by the signed webhook (razorpay-webhook).
//
// Secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET; optional PAYMENT_RETURN_URL
// (e.g. https://admin.localloop.in/pay/return) for the "back to the app" page.
import { linkExpiry, paymentLinkBody, razorpay, toPaise } from '../_shared/razorpay.ts';
import { adminClient, callerId, json } from '../_shared/supabase.ts';

interface Ctx {
  order_id: string;
  order_number: string;
  status: string;
  amount: string;
  payment_id: string;
  payment_status: string;
  checkout_url: string | null;
  checkout_expires_at: string | null;
  store_name: string;
  customer_name: string | null;
  customer_phone: string | null;
  expires_at: string;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const keyId = Deno.env.get('RAZORPAY_KEY_ID');
  const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET');
  if (!keyId || !keySecret) return json({ error: 'payment_method_unavailable' }, 503);

  const uid = await callerId(req);
  if (!uid) return json({ error: 'not_authenticated' }, 401);
  let orderId: string | undefined;
  try {
    orderId = (await req.json())?.order_id;
  } catch {
    /* fall through */
  }
  if (!orderId) return json({ error: 'order_not_found' }, 400);

  const db = adminClient();
  const { data, error } = await db.rpc('online_payment_context', { p_order_id: orderId, p_customer_id: uid });
  if (error) return json({ error: 'lookup_failed' }, 500);
  const ctx = data as Ctx | null;
  if (!ctx) return json({ error: 'order_not_found' }, 404);
  if (ctx.payment_status === 'paid') return json({ error: 'already_paid' }, 409);
  if (ctx.status !== 'awaiting_payment') return json({ error: 'payment_window_closed' }, 409);

  // Reuse a link that is still valid.
  if (ctx.checkout_url && ctx.checkout_expires_at && new Date(ctx.checkout_expires_at).getTime() > Date.now() + 60_000) {
    return json({ url: ctx.checkout_url, expires_at: ctx.expires_at });
  }

  const expireBy = linkExpiry(new Date(ctx.expires_at));
  let link: { id: string; short_url: string };
  try {
    link = await razorpay<{ id: string; short_url: string }>(
      '/payment_links',
      {
        method: 'POST',
        body: paymentLinkBody({
          orderId: ctx.order_id,
          orderNumber: ctx.order_number,
          amountPaise: toPaise(ctx.amount),
          storeName: ctx.store_name,
          customerName: ctx.customer_name,
          customerPhone: ctx.customer_phone,
          expireBy,
          callbackUrl: Deno.env.get('PAYMENT_RETURN_URL'),
          attempt: Date.now().toString(36),
        }),
      },
      keyId,
      keySecret,
    );
  } catch (e) {
    console.error('razorpay-pay: link creation failed', ctx.order_number, (e as Error).message);
    return json({ error: 'payment_provider_error' }, 502);
  }

  // Only one link per order: if a parallel request stored one first, cancel ours and use theirs.
  const { data: stored } = await db
    .from('payments')
    .update({ provider_order_id: link.id, checkout_url: link.short_url, checkout_expires_at: new Date(expireBy * 1000).toISOString() })
    .eq('id', ctx.payment_id)
    .eq('status', 'pending')
    .or(`provider_order_id.is.null,checkout_expires_at.lt."${new Date(Date.now() + 60_000).toISOString()}"`)
    .select('checkout_url')
    .maybeSingle();
  if (!stored) {
    await razorpay(`/payment_links/${link.id}/cancel`, { method: 'POST' }, keyId, keySecret).catch(() => undefined);
    const { data: again } = await db.from('payments').select('checkout_url').eq('id', ctx.payment_id).single();
    return again?.checkout_url ? json({ url: again.checkout_url, expires_at: ctx.expires_at }) : json({ error: 'payment_provider_error' }, 502);
  }
  return json({ url: link.short_url, expires_at: ctx.expires_at });
});
