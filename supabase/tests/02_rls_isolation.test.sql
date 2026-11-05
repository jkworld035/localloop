-- Row Level Security and privilege boundaries between roles.
begin;
\ir _helpers.sql
select plan(26);

select tests.seed_world();
select tests.store() as store_id, tests.variant() as variant_id, tests.address() as address_id \gset

-- ── anonymous ─────────────────────────────────────────────
select tests.anon();
select throws_ok($$ select * from public.profiles $$, '42501', null, 'anon cannot read profiles');
select throws_ok($$ select public.place_order(gen_random_uuid(), 'cod', gen_random_uuid()) $$, '42501', null,
                 'anon cannot execute place_order');
select is((select count(*)::int from public.stores), 1, 'anon sees only approved stores');

-- ── roles ─────────────────────────────────────────────────
select tests.login(tests.id('customer'));
select throws_ok($$ select public.choose_role('admin') $$, 'P0001', 'role_not_allowed', 'admin cannot be self-selected');
select throws_ok($$ select public.choose_role('vendor') $$, 'P0001', 'role_already_set', 'role cannot be switched');
select throws_ok($$ update public.profiles set role = 'admin' where id = auth.uid() $$, '42501', null,
                 'profile.role is not client-writable');
select lives_ok($$ update public.profiles set full_name = 'Lakshmi Devi' where id = auth.uid() $$, 'own name is editable');
select throws_ok($$ select public.admin_overview() $$, 'P0001', 'forbidden', 'non-admin cannot read admin metrics');

-- ── customer data isolation ───────────────────────────────
select tests.login(tests.id('customer2'));
select is((select count(*)::int from public.addresses), 0, 'other customers'' addresses are invisible');
select is((select count(*)::int from public.profiles), 1, 'a user sees only their own profile');
select throws_ok(format($$ insert into public.orders (order_number, customer_id, store_id, delivery_address, delivery_location,
                            subtotal, total, payment_method, idempotency_key)
                          values ('X', auth.uid(), %L, '{}', public._point(18.33, 78.34), 1, 1, 'cod', gen_random_uuid()) $$,
                          :'store_id'), '42501', null, 'orders cannot be inserted directly');

-- customer places an order, then tries to tamper with it
select tests.login(tests.id('customer'));
select public.start_cart(tests.store());
insert into public.cart_items (cart_id, variant_id, quantity)
select id, :'variant_id', 1 from public.carts where customer_id = tests.id('customer');
select (public.place_order(:'address_id', 'cod', gen_random_uuid()) ->> 'order_id') as order_id \gset
select throws_ok(format($$ update public.orders set status = 'delivered' where id = %L $$, :'order_id'), '42501', null,
                 'customer cannot change order status');
select throws_ok(format($$ update public.payments set status = 'paid' where order_id = %L $$, :'order_id'), '42501', null,
                 'customer cannot confirm payment');
select is((select count(*)::int from public.order_secrets where order_id = :'order_id'), 1, 'customer can read their OTP');

select tests.login(tests.id('customer2'));
select is((select count(*)::int from public.orders), 0, 'other customers cannot see the order');

-- ── vendor boundaries ─────────────────────────────────────
select tests.login(tests.id('vendor2'));
select is((select count(*)::int from public.orders), 0, 'another vendor cannot see this store''s orders');
select throws_ok(format($$ select public.vendor_accept_order(%L, 10) $$, :'order_id'), 'P0001', 'order_not_found',
                 'another vendor cannot act on the order');
select is((select count(*)::int from public.order_secrets), 0, 'vendors cannot read delivery OTPs');

select tests.login(tests.id('vendor'));
select is((select count(*)::int from public.orders), 1, 'store owner sees the order');
select throws_ok(format($$ update public.stores set status = 'approved', is_featured = true where id = %L $$, :'store_id'),
                 '42501', null, 'vendor cannot self-approve or feature a store');
update public.stores set location = public._point(18.3210, 78.3380) where id = :'store_id';
select tests.su();
select is((select status::text from public.stores where id = :'store_id'), 'pending',
          'moving an approved store sends it back to review');

-- ── partner boundaries ────────────────────────────────────
select tests.login(tests.id('partner2'));
select is((select count(*)::int from public.orders), 0, 'unassigned partner cannot read orders');
select tests.su();
update public.delivery_partners set status = 'pending' where id = tests.id('partner2');
select tests.login(tests.id('partner2'));
select throws_ok($$ update public.delivery_partners set status = 'approved' where id = auth.uid() $$, '42501', null,
                 'pending partner cannot approve themselves');
select throws_ok($$ select public.partner_set_online(true, 18.32, 78.33, 5) $$, 'P0001', 'partner_not_approved',
                 'unapproved partner cannot go online');

-- ── admin ─────────────────────────────────────────────────
select tests.login(tests.id('admin'));
select ok((public.admin_overview() ->> 'orders_in_progress')::int >= 1, 'admin reads overview metrics');
select ok((select count(*) from public.admin_audit_logs where entity_type = 'stores') >= 1,
          'admin store approval is audited');

select * from finish();
rollback;
