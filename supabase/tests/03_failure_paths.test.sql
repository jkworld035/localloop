-- Failure paths: stock, cancellation, invalid transitions, dispatch edge
-- cases, GPS quality, coupons and payment-mode gating.
begin;
\ir _helpers.sql
select plan(23);

select tests.seed_world();
select tests.store() as store_id, tests.variant() as variant_id, tests.address() as address_id \gset

-- ── stock ─────────────────────────────────────────────────
select tests.login(tests.id('customer'));
select public.start_cart(tests.store());
insert into public.cart_items (cart_id, variant_id, quantity)
select id, :'variant_id', 11 from public.carts where customer_id = tests.id('customer');
select ok(public.quote_cart(:'address_id') -> 'issues' ->> 0 like 'insufficient_stock:%', 'quote flags insufficient stock');
select throws_ok(format($$ select public.place_order(%L, 'cod', gen_random_uuid()) $$, :'address_id'),
                 'P0001', 'insufficient_stock', 'cannot order more than stock');
update public.cart_items set quantity = 3;

-- ── payment-mode gating ──────────────────────────────────
select throws_ok(format($$ select public.place_order(%L, 'test', gen_random_uuid()) $$, :'address_id'),
                 'P0001', 'payment_method_unavailable', 'test payments are off by default');
select throws_ok(format($$ select public.place_order(%L, 'razorpay', gen_random_uuid()) $$, :'address_id'),
                 'P0001', 'payment_method_unavailable', 'gateway payments are not enabled yet');

-- ── coupons ───────────────────────────────────────────────
select tests.login(tests.id('admin'));
insert into public.coupons (code, discount_type, discount_value, max_discount, min_order_value)
values ('WELCOME10', 'percent', 10, 50, 100);
select tests.login(tests.id('customer'));
select is((public.quote_cart(:'address_id', 'welcome10') ->> 'discount')::numeric, 50.00,
          'percent coupon capped at max_discount (case-insensitive code)');
select is(public.quote_cart(:'address_id', 'NOPE') -> 'issues' ->> 0, 'coupon_invalid', 'unknown coupon flagged');

-- ── customer cancel restocks ──────────────────────────────
select (public.place_order(:'address_id', 'cod', gen_random_uuid(), 'WELCOME10') ->> 'order_id') as o1 \gset
select tests.su();
select is((select quantity from public.inventory where variant_id = :'variant_id'), 7, 'stock reserved at placement');
select is((select discount from public.orders where id = :'o1'), 50.00, 'coupon discount applied to order');
select tests.login(tests.id('customer'));
select throws_ok($$ select public.quote_cart() $$, 'P0001', 'cart_empty', 'cart is empty after checkout');
select lives_ok(format($$ select public.customer_cancel_order(%L, 'Ordered by mistake') $$, :'o1'),
                'customer cancels before acceptance');
select tests.su();
select is((select quantity from public.inventory where variant_id = :'variant_id'), 10, 'stock returned on cancel');
select is((select status::text from public.payments where order_id = :'o1'), 'failed', 'COD payment closed');

-- ── invalid transitions ───────────────────────────────────
select tests.login(tests.id('customer'));
insert into public.cart_items (cart_id, variant_id, quantity)
select id, :'variant_id', 1 from public.carts where customer_id = tests.id('customer');
select (public.place_order(:'address_id', 'cod', gen_random_uuid()) ->> 'order_id') as o2 \gset
select tests.login(tests.id('vendor'));
select throws_ok(format($$ select public.vendor_mark_ready(%L) $$, :'o2'), 'P0001', 'invalid_transition',
                 'placed → ready_for_pickup is rejected');
select throws_ok(format($$ select public.vendor_reject_order(%L, '') $$, :'o2'), 'P0001', 'reason_required',
                 'rejection needs a reason');
select tests.login(tests.id('customer'));
select throws_ok(format($$ select public.submit_review(%L, 'store', 5::smallint) $$, :'o2'), 'P0001',
                 'review_requires_delivery', 'cannot review an undelivered order');

-- ── dispatch edge cases ───────────────────────────────────
-- partner1 online but with a stale fix; partner3 (bicycle) fresh at the store
select tests.login(tests.id('partner1')); select public.partner_set_online(true, 18.3204, 78.3371, 8);
select tests.login(tests.id('partner3')); select public.partner_set_online(true, 18.3203, 78.3372, 8);
select tests.su();
update public.delivery_partners set current_location_at = now() - interval '10 minutes' where id = tests.id('partner1');

select tests.login(tests.id('vendor'));
select public.vendor_accept_order(:'o2', 10);
select tests.su();
select is((select array_agg(partner_id) from public.delivery_assignments where order_id = :'o2'),
          array[tests.id('partner3')], 'only the partner with a fresh fix is offered (bicycle allowed for 1.2 km trip)');

update public.delivery_assignments set expires_at = now() - interval '1 second' where order_id = :'o2';
select tests.login(tests.id('partner3'));
select is((public.partner_accept_assignment(
             (select id from public.delivery_assignments where order_id = :'o2' and partner_id = tests.id('partner3')))
           ->> 'error'), 'offer_expired', 'expired offers cannot be accepted');

select tests.su();
select is((select count(*)::int from public.notifications where user_id = tests.id('vendor') and type = 'no_partner_available'), 0,
          'vendor not told "no partner" while an offer was open');
select is(public.expire_offers_and_redispatch(), 1, 'cron re-dispatch re-offers the order');

select throws_ok(format($$ insert into public.delivery_assignments (order_id, partner_id, status, expires_at)
                          values (%L, %L, 'accepted', now()), (%L, %L, 'accepted', now()) $$,
                        :'o2', tests.id('partner1'), :'o2', tests.id('partner2')),
                 '23505', null, 'unique index forbids two active partners on one order');

-- ── GPS quality ───────────────────────────────────────────
select tests.login(tests.id('partner3'));
select is(public.update_driver_location(18.3203, 78.3372, 900) ->> 'reason', 'low_accuracy', 'inaccurate fixes are ignored');
select throws_ok($$ select public.update_driver_location(18.3203, 78.3372, 5, null, null, now() + interval '5 minutes') $$,
                 'P0001', 'invalid_timestamp', 'future timestamps are refused');
select is(public.update_driver_location(18.3203, 78.3372, 5, null, null, now() - interval '1 hour') ->> 'reason', 'too_old',
          'fixes older than 15 minutes are dropped');

select * from finish();
rollback;
