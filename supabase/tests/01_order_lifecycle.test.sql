-- End-to-end order lifecycle across customer, vendor, two competing partners
-- and the routing edge function (service role).
begin;
\ir _helpers.sql
select plan(41);

select tests.seed_world();
select tests.store() as store_id, tests.variant() as variant_id, tests.address() as address_id \gset

-- ── discovery ──────────────────────────────────────────────
select tests.anon();
select is((select count(*)::int from public.nearby_stores(18.3300, 78.3420, 3)), 1,
          'anon discovers the approved store within 3 km');
select is((select count(*)::int from public.nearby_stores(18.4500, 78.3420, 3)), 0,
          'store is not returned outside the search radius');
select ok((select delivers_here from public.nearby_stores(18.3300, 78.3420, 3) limit 1),
          'store reports it delivers to this point');
select is((public.area_status(18.3300, 78.3420) ->> 'serviceable')::boolean, true, 'Kamareddy is serviceable');
select is((public.area_status(17.3850, 78.4867) ->> 'serviceable')::boolean, false, 'Hyderabad is not yet serviceable');

-- ── cart & checkout ───────────────────────────────────────
select tests.login(tests.id('customer'));
select lives_ok($$ select public.start_cart(tests.store()) $$, 'customer starts a cart');
insert into public.cart_items (cart_id, variant_id, quantity)
select id, :'variant_id', 2 from public.carts where customer_id = tests.id('customer');
select is((public.quote_cart(:'address_id') ->> 'subtotal')::numeric, 760.00, 'quote uses sale price × qty');
select is(jsonb_array_length(public.quote_cart(:'address_id') -> 'issues'), 0, 'quote has no blocking issues');

select public.place_order(:'address_id', 'cod', '11111111-1111-1111-1111-111111111111') as placed \gset
select ok((:'placed'::jsonb ->> 'order_number') like 'LL%', 'order placed with an LL number');
select (:'placed'::jsonb ->> 'order_id') as order_id \gset
insert into public.cart_items (cart_id, variant_id, quantity)
select id, :'variant_id', 1 from public.carts where customer_id = tests.id('customer');
select is((public.place_order(:'address_id', 'cod', '11111111-1111-1111-1111-111111111111') ->> 'order_id'),
          :'order_id', 'retrying with the same idempotency key returns the same order');
delete from public.cart_items;

select tests.su();
select is((select quantity from public.inventory where variant_id = :'variant_id'), 8, 'stock decremented by 2');
select is((select status::text from public.orders where id = :'order_id'), 'placed', 'order starts as placed');
select is((select count(*)::int from public.notifications where user_id = tests.id('vendor') and type = 'new_order'), 1,
          'vendor notified of new order');

-- ── vendor accepts → dispatch ─────────────────────────────
-- partners come online near the store (partner3 is on a bicycle; trip 1.2 km is allowed)
select tests.login(tests.id('partner1')); select public.partner_set_online(true, 18.3204, 78.3371, 8);
select tests.login(tests.id('partner2')); select public.partner_set_online(true, 18.3250, 78.3400, 10);

select tests.login(tests.id('vendor'));
select lives_ok(format($$ select public.vendor_accept_order(%L, 12) $$, :'order_id'), 'vendor accepts with prep time');
select tests.su();
select is((select count(*)::int from public.delivery_assignments where order_id = :'order_id' and status = 'offered'), 2,
          'nearest online partners receive offers');

select tests.login(tests.id('partner1'));
select is((select count(*)::int from public.partner_offers()), 1, 'partner1 sees one open offer');
select is((select delivery_locality from public.partner_offers() limit 1), 'Vidyanagar',
          'offer shows only the drop locality');
select id as a1 from public.delivery_assignments where partner_id = tests.id('partner1') and order_id = :'order_id' \gset
select tests.login(tests.id('partner2'));
select id as a2 from public.delivery_assignments where partner_id = tests.id('partner2') and order_id = :'order_id' \gset

select tests.login(tests.id('partner1'));
select is((public.partner_accept_assignment(:'a1') ->> 'ok')::boolean, true, 'partner1 accepts first');
select tests.login(tests.id('partner2'));
select throws_ok(format($$ select public.partner_accept_assignment(%L) $$, :'a2'), 'P0001', 'offer_not_open',
                 'partner2 cannot accept the same order');
select tests.su();
select is((select count(*)::int from public.delivery_assignments
            where order_id = :'order_id' and status in ('accepted', 'picked_up')), 1, 'exactly one active assignment');

-- ── preparation and pickup ────────────────────────────────
select tests.login(tests.id('partner1'));
select throws_ok(format($$ select public.partner_confirm_pickup(%L) $$, :'a1'), 'P0001', 'order_not_ready',
                 'pickup blocked until the order is ready');
select tests.login(tests.id('vendor'));
select lives_ok(format($$ select public.vendor_mark_preparing(%L) $$, :'order_id'), 'vendor marks preparing');
select lives_ok(format($$ select public.vendor_mark_ready(%L) $$, :'order_id'), 'vendor marks ready');

select tests.login(tests.id('customer'));
select is((public.get_order_tracking(:'order_id') -> 'assignment' ->> 'live')::boolean, false,
          'no live location before pickup');

select tests.login(tests.id('partner1'));
select lives_ok(format($$ select public.partner_confirm_pickup(%L) $$, :'a1'), 'partner1 picks up at the store');
select ok((public.update_driver_location(18.3250, 78.3395, 6, 40, 7.5) -> 'assignments' -> 0 ->> 'eta_due')::boolean,
          'first fix on the delivery leg asks for a route ETA');

-- routing edge function writes the provider result
select tests.service();
select public.record_route(:'a1', 'to_customer', 18.3250, 78.3395, 18.3300, 78.3420, 820, 150,
                           'abc', true, 'TWO_WHEELER', 'google_routes', 'status_change');

select tests.login(tests.id('customer'));
select is((public.get_order_tracking(:'order_id') -> 'assignment' ->> 'live')::boolean, true, 'tracking is live after pickup');
select is((public.get_order_tracking(:'order_id') -> 'assignment' ->> 'remaining_distance_m')::int, 820,
          'customer sees the routed road distance');
select is((select count(*)::int from public.delivery_assignments where order_id = :'order_id'), 1,
          'customer can read the live assignment row (Realtime source)');
select is((select count(*)::int from public.notifications where type = 'partner_approaching'), 1,
          '"partner approaching" sent when road ETA under threshold');

-- ── OTP handover ──────────────────────────────────────────
select delivery_otp as otp from public.order_secrets where order_id = :'order_id' \gset
select tests.login(tests.id('partner1'));
select public.update_driver_location(18.3299, 78.3419, 5);
select is(public.partner_complete_delivery(:'a1', '0000') ->> 'error',
          case when :'otp' = '0000' then null else 'otp_incorrect' end, 'wrong OTP is refused');
select tests.su();
select is((select failed_attempts::int from public.order_secrets where order_id = :'order_id'),
          case when :'otp' = '0000' then 0 else 1 end, 'failed attempt is recorded');
select tests.login(tests.id('partner1'));
select is((public.partner_complete_delivery(:'a1', :'otp') ->> 'ok')::boolean, true, 'correct OTP completes delivery');

select tests.su();
select is((select status::text from public.orders where id = :'order_id'), 'delivered', 'order delivered');
select is((select payment_status::text from public.orders where id = :'order_id'), 'paid', 'COD marked paid');
select is((select commission_amount from public.commissions where order_id = :'order_id'), 76.00,
          'commission = default rate × subtotal');

select tests.login(tests.id('customer'));
select is((select count(*)::int from public.delivery_assignments where order_id = :'order_id'), 0,
          'customer loses access to the partner location after delivery');
select is((select count(*)::int from public.order_secrets where order_id = :'order_id'), 0,
          'OTP hidden once the order is closed');

-- ── reviews ───────────────────────────────────────────────
select lives_ok(format($$ select public.submit_review(%L, 'store', 5::smallint, 'Good rice') $$, :'order_id'),
                'customer reviews the store');
select throws_ok(format($$ select public.submit_review(%L, 'store', 4::smallint) $$, :'order_id'), 'P0001', 'already_reviewed',
                 'one store review per order');
select tests.su();
select is((select rating_avg from public.stores where id = :'store_id'), 5.00, 'store rating aggregated');

select * from finish();
rollback;
