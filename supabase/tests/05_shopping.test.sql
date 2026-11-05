-- Phase 2 shopping flow: shop page, addresses, cart writes exactly as the app performs them, order detail.
begin;
\ir _helpers.sql
select plan(16);

select tests.seed_world();
select tests.store() as store_id, tests.variant() as variant_id, tests.address() as address_id \gset

-- ── shop page ─────────────────────────────────────────────
select tests.anon();
select is((public.store_summary(:'store_id', 18.3300, 78.3420) ->> 'delivers_here')::boolean, true, 'shop page: delivers to customer');
select ok((public.store_summary(:'store_id', 18.3300, 78.3420) ->> 'distance_m')::int between 1100 and 1300, 'shop page: distance from customer');
select is(public.store_summary(:'store_id') ->> 'distance_m', null, 'shop page works without a location');
select tests.su();
update public.stores set status = 'suspended' where id = :'store_id';
select tests.anon();
select throws_ok(format($$ select public.store_summary(%L) $$, :'store_id'), 'P0001', 'store_unavailable', 'suspended shop is hidden');
select tests.login(tests.id('vendor'));
select ok(public.store_summary(:'store_id') ->> 'name' is not null, 'owner still sees their own shop');
select tests.su();
update public.stores set status = 'approved' where id = :'store_id';

-- ── catalogue query the shop page runs (embedded variants + inventory) ──
select tests.anon();
select is((select count(*)::int from public.products p
            join public.product_variants v on v.product_id = p.id
            join public.inventory i on i.variant_id = v.id
           where p.store_id = :'store_id'), 1, 'anon reads products with variants and stock');

-- ── addresses as the app writes them (EWKT location string) ──
select tests.login(tests.id('customer'));
insert into public.addresses (user_id, label, contact_name, contact_phone, line1, locality, city, state, pincode, location)
values (auth.uid(), 'Work', 'Lakshmi', '+919000000001', 'Collectorate Road', 'Collectorate', 'Kamareddy', 'Telangana', '503111',
        'SRID=4326;POINT(78.3350 18.3150)') returning id as work_id \gset
select is((select count(*)::int from public.addresses where user_id = auth.uid() and deleted_at is null), 2, 'address saved from EWKT');
select lives_ok(format($$ select public.set_default_address(%L) $$, :'work_id'), 'set default address');
select is((select count(*)::int from public.addresses where user_id = auth.uid() and is_default), 1, 'exactly one default');
select is((select default_address_id from public.customers where id = auth.uid()), :'work_id'::uuid, 'customer default updated');

-- ── cart writes (the app inserts, then updates quantity only) ──
select public.start_cart(tests.store()) as cart_id \gset
select lives_ok(format($$ insert into public.cart_items (cart_id, variant_id, quantity) values (%L, %L, 1) $$, :'cart_id', :'variant_id'),
                'add item to cart');
select lives_ok(format($$ update public.cart_items set quantity = 3 where cart_id = %L and variant_id = %L $$, :'cart_id', :'variant_id'),
                'change quantity');
select throws_ok(format($$ update public.cart_items set cart_id = gen_random_uuid() where cart_id = %L $$, :'cart_id'), '42501', null,
                 'cart item cannot be moved to another cart');

-- ── order detail as the app reads it ──
select (public.place_order(:'address_id', 'cod', gen_random_uuid(), null, 'Ring the bell') ->> 'order_id') as order_id \gset
select is((select count(*)::int from public.order_items where order_id = :'order_id'), 1, 'order detail: items');
select is((select count(*)::int from public.order_status_history where order_id = :'order_id'), 1, 'order detail: status timeline');
select tests.login(tests.id('customer2'));
select is((select count(*)::int from public.order_items where order_id = :'order_id'), 0, 'other customers cannot read the items');

select * from finish();
rollback;
