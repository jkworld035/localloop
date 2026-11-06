-- Phase 7b: online payments (Razorpay) — the database side of the flow.
begin;
\ir _helpers.sql
select plan(20);

select tests.seed_world();
select tests.variant() as variant_id, tests.address() as address_id \gset

select tests.su();
create function tests.cart() returns void language plpgsql as $$
begin
  perform tests.login(tests.id('customer'));
  perform public.start_cart(tests.store());
  delete from public.cart_items where cart_id in (select id from public.carts where customer_id = tests.id('customer'));
  insert into public.cart_items (cart_id, variant_id, quantity)
  select id, tests.variant(), 1 from public.carts where customer_id = tests.id('customer');
end $$;
grant execute on function tests.cart() to public;

-- ── switched off by default ───────────────────────────────
select tests.cart();
select throws_ok(format($$ select public.place_order(%L, 'razorpay', gen_random_uuid()) $$, :'address_id'),
                 'P0001', 'payment_method_unavailable', 'online payment is refused until switched on');
select tests.su();
update public.app_settings set value = 'true' where key = 'online_payments_enabled';

-- ── placing an online order ───────────────────────────────
select quantity as stock0 from public.inventory where variant_id = :'variant_id' \gset
select tests.cart();
select public.place_order(:'address_id', 'razorpay', gen_random_uuid()) as placed \gset
select (:'placed'::jsonb ->> 'order_id') as o1 \gset
select is((:'placed'::jsonb ->> 'awaiting_payment')::boolean, true, 'app is told to collect payment');
select is((select status::text from public.orders where id = :'o1'), 'awaiting_payment', 'order waits for payment');
select tests.su();
select is((select quantity from public.inventory where variant_id = :'variant_id'), :'stock0'::int - 1, 'stock is reserved while paying');
select is((select count(*)::int from public.notifications where user_id = tests.id('vendor') and type = 'new_order'), 0,
          'shop is not told before payment');
select tests.login(tests.id('vendor'));
select is((select count(*)::int from public.orders where id = :'o1'), 0, 'shop cannot see an unpaid order');

-- The app can't confirm payments itself.
select tests.login(tests.id('customer'));
select throws_ok(format($$ select public.confirm_online_payment('plink_x', 'pay_x', 100) $$), '42501', null,
                 'apps cannot mark a payment as paid');

-- ── webhook confirms the payment ──────────────────────────
select tests.su();
update public.payments set provider_order_id = 'plink_1' where order_id = :'o1';
select round(total * 100)::bigint as paise from public.orders where id = :'o1' \gset
select tests.service();
select is(public.confirm_online_payment('plink_1', 'pay_1', :paise), 'ok', 'payment confirmed');
select is(public.confirm_online_payment('plink_1', 'pay_1', :paise), 'duplicate', 'repeated webhook is ignored');
select tests.su();
select is((select status::text || '/' || payment_status::text from public.orders where id = :'o1'), 'placed/paid', 'order goes to the shop, paid');
select ok((select released_at is not null from public.orders where id = :'o1'), 'release time recorded');
select is((select count(*)::int from public.notifications where user_id = tests.id('vendor') and type = 'new_order'), 1, 'shop is told now');
select tests.login(tests.id('vendor'));
select is((select count(*)::int from public.orders where id = :'o1'), 1, 'shop now sees the order');

-- ── shop rejects a paid order → refund queued ─────────────
select public.vendor_reject_order(:'o1', 'Out of stock today');
select tests.su();
select is((select refund_status from public.payments where order_id = :'o1'), 'requested', 'refund queued for a rejected paid order');
select is((select payment_status::text from public.orders where id = :'o1'), 'paid', 'shown as paid until the refund goes through');

-- ── abandoned payment expires ─────────────────────────────
select tests.cart();
select (public.place_order(:'address_id', 'razorpay', gen_random_uuid()) ->> 'order_id') as o2 \gset
select tests.su();
update public.payments set provider_order_id = 'plink_2' where order_id = :'o2';
select quantity as stock_before_expiry from public.inventory where variant_id = :'variant_id' \gset
update public.orders set created_at = now() - interval '25 minutes' where id = :'o2';
select is(public.expire_unpaid_orders(), 1, 'unpaid order cancelled after the window');
select is((select quantity from public.inventory where variant_id = :'variant_id'), :'stock_before_expiry'::int + 1, 'reserved stock released');
select is((select status::text from public.payments where order_id = :'o2'), 'failed', 'payment marked failed');
select tests.service();
select is(public.confirm_online_payment('plink_2', 'pay_2', 100), 'amount_mismatch', 'wrong amount is never accepted');
select tests.su();
select is((select refund_status from public.payments where order_id = :'o2'), 'requested', 'late or wrong payment is refunded');

select * from finish();
rollback;
