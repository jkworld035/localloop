-- LocalLoop · 0022 · new order status for online payment (Phase 7b)
-- On its own because a new enum value can't be used in the transaction that
-- adds it. Online-paid orders wait here until Razorpay confirms the payment;
-- the shop never sees them before that.
alter type public.order_status add value if not exists 'awaiting_payment' before 'placed';
