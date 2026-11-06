-- Phase 4: partner dashboard, the exact reads the partner app and tracking screen perform.
begin;
\ir _helpers.sql
select plan(18);

select tests.seed_world();
select tests.variant() as variant_id, tests.address() as address_id \gset

-- customer orders, vendor accepts, partner1 online near the shop
select tests.login(tests.id('customer'));
select public.start_cart(tests.store());
insert into public.cart_items (cart_id, variant_id, quantity)
select id, :'variant_id', 1 from public.carts where customer_id = tests.id('customer');
select (public.place_order(:'address_id', 'cod', gen_random_uuid()) ->> 'order_id') as order_id \gset
select tests.login(tests.id('partner1'));
select public.partner_set_online(true, 18.3204, 78.3371, 8);
select tests.login(tests.id('vendor'));
select public.vendor_accept_order(:'order_id', 10);

-- ── offers as the partner app reads them ──────────────────
select tests.login(tests.id('partner1'));
select is((public.partner_dashboard() ->> 'active_assignment_id'), null, 'no active job before accepting');
select is((select count(*)::int from public.delivery_assignments where partner_id = auth.uid() and status = 'offered'), 1,
          'partner reads their open offer (realtime source)');
select assignment_id as a1 from public.partner_offers() limit 1 \gset
select public.partner_accept_assignment(:'a1');
select is((public.partner_dashboard() ->> 'active_assignment_id'), :'a1', 'accepted job shows as active');
select is((public.partner_active_job(:'a1') ->> 'order_status'), 'accepted', 'job screen loads');
select ok((public.partner_active_job(:'a1') -> 'drop' ->> 'contact_phone') is not null, 'after accepting, partner sees the drop contact');
select is((select count(*)::int from public.orders where id = :'order_id'), 1, 'partner can read the order row (realtime status source)');

-- ── customer tracking before and after pickup ─────────────
select tests.login(tests.id('customer'));
select is((public.get_order_tracking(:'order_id') -> 'assignment' -> 'partner' ->> 'name'), 'Suresh', 'customer sees partner first name once assigned');
select is((public.get_order_tracking(:'order_id') -> 'assignment' ->> 'latitude'), null, 'no partner position before pickup');
select is((select count(*)::int from public.delivery_assignments where order_id = :'order_id'), 0,
          'customer cannot read the tracking row before pickup (realtime source)');

select tests.login(tests.id('vendor'));
select public.vendor_mark_ready(:'order_id');
select tests.login(tests.id('partner1'));
select public.partner_confirm_pickup(:'a1');
select public.update_driver_location(18.3260, 78.3400, 6, 30, 6);
select tests.login(tests.id('customer'));
select ok((public.get_order_tracking(:'order_id') -> 'assignment' ->> 'latitude')::float between 18.32 and 18.33, 'customer sees live position after pickup');
select is((select count(*)::int from public.delivery_assignments where order_id = :'order_id' and last_location is not null), 1,
          'customer reads the live tracking row while out for delivery (realtime source)');

-- ── completion and earnings ───────────────────────────────
select delivery_otp as otp from public.order_secrets where order_id = :'order_id' \gset
select tests.login(tests.id('partner1'));
select public.update_driver_location(18.3299, 78.3419, 5);
select is((public.partner_complete_delivery(:'a1', :'otp') ->> 'ok')::boolean, true, 'delivery completed');
select is((public.partner_dashboard() ->> 'deliveries_today')::int, 1, 'counted in today''s deliveries');
select ok((public.partner_dashboard() ->> 'earnings_today')::numeric > 0, 'earning recorded from settings');
select is((public.partner_dashboard() ->> 'cash_in_hand')::numeric, (select total from public.orders where id = :'order_id'),
          'COD cash collected shows as cash in hand');

-- ── ownership ─────────────────────────────────────────────
select tests.login(tests.id('partner1'));
select lives_ok($$ insert into public.delivery_documents (partner_id, doc_type, storage_path)
                   values (auth.uid(), 'driving_licence', auth.uid()::text || '/dl.jpg') $$, 'partner uploads a document record in their folder');
select throws_ok($$ insert into public.delivery_documents (partner_id, doc_type, storage_path)
                    values (auth.uid(), 'vehicle_rc', 'someone-else/rc.jpg') $$, '42501', null, 'document path must be in the partner''s own folder');
select tests.login(tests.id('customer'));
select throws_ok($$ select public.partner_dashboard() $$, 'P0001', 'wrong_role', 'customers cannot read partner dashboards');

select * from finish();
rollback;
