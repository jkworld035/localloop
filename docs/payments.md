# Online payments (Razorpay)

Customers can pay by UPI (GPay, PhonePe, Paytm…), card or netbanking through
a Razorpay payment page. Cash on delivery stays available. Online payment is
**off** until you switch on `online_payments_enabled` in Admin → Platform settings.

## How it works
1. Checkout with "UPI, card or netbanking" → the order is created as **Waiting for payment**. Stock is held; the shop is not told yet.
2. The app opens Razorpay's payment page (function `razorpay-pay`, which creates a Razorpay Payment Link for the exact total).
3. Razorpay sends a signed webhook (`razorpay-webhook`) → the database confirms the payment, the order moves to **Placed**, and the shop gets the "New order" notification. The app updates by itself.
4. Not paid within `payment_window_minutes` (20) → the order is cancelled and stock released.
5. Money is returned automatically (`razorpay-refund`) when a paid order is rejected by the shop, cancelled, paid after the window closed, or paid with a wrong amount. Admin → Finance shows refunds in progress and lets you retry a failed one.

The app never decides a payment succeeded — only Razorpay's signed webhook does.

## Setup (test mode first)
In the Razorpay dashboard, switch to **Test mode**.

1. **API keys** — Account & Settings → API Keys → Generate key. In PowerShell (in `C:\dev\local-loop`), type the values when asked (don't paste them in chat):
   ```powershell
   $id = Read-Host "Razorpay Key Id"; $secret = Read-Host "Razorpay Key Secret"
   npx supabase@latest secrets set "RAZORPAY_KEY_ID=$id" "RAZORPAY_KEY_SECRET=$secret" --project-ref <project-ref>
   ```
2. **Webhook** — Account & Settings → Webhooks → Add new webhook:
   - URL: `https://<project-ref>.supabase.co/functions/v1/razorpay-webhook` (your custom API domain once you have one)
   - Secret: make up a long random string
   - Active events: `payment_link.paid` and `refund.failed`
   ```powershell
   $wh = Read-Host "Webhook secret"; npx supabase@latest secrets set "RAZORPAY_WEBHOOK_SECRET=$wh" --project-ref <project-ref>
   ```
3. **Optional return page** — after paying, Razorpay can show a "back to LocalLoop" page from the admin site once it is online:
   `npx supabase@latest secrets set PAYMENT_RETURN_URL=https://admin.localloop.in/pay/return --project-ref <project-ref>`
4. **Deploy the functions**:
   ```powershell
   npx supabase@latest functions deploy razorpay-pay razorpay-webhook razorpay-refund --project-ref <project-ref> --use-api
   ```
5. **Scheduled jobs** — check `select jobname from cron.job;` lists `localloop-expire-unpaid` and `localloop-refund-sweep`; if not:
   ```sql
   select cron.schedule('localloop-expire-unpaid', '* * * * *', 'select public.expire_unpaid_orders()');
   select cron.schedule('localloop-refund-sweep', '*/10 * * * *', 'select public.refund_sweep()');
   ```
6. Admin → Platform settings → `online_payments_enabled` → `true`.

**Test it**: place an order with "UPI, card or netbanking". On Razorpay's test page use their test UPI ID `success@razorpay` (or a test card from Razorpay's docs). The order should switch to Placed within a few seconds and the shop should get it. Try `failure@razorpay` too, and a shop rejecting a paid order (refund appears in Finance, then in Razorpay → Refunds).

## Going live
After Razorpay approves your KYC, switch the dashboard to **Live mode**, generate live keys and a live webhook (same URL and events), and replace the three secrets in the **production** Supabase project. Razorpay settles collected money to your bank account on its settlement schedule; you still pay shops from Admin → Finance.
