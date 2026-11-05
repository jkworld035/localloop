-- Shared fixtures for the pgTAP suites. Each *.test.sql file runs inside a
-- transaction that is rolled back, and \ir's this file first.
create schema if not exists tests;
grant usage on schema tests to public;

-- Impersonate a signed-in user exactly as PostgREST does: role + JWT sub claim.
create or replace function tests.login(p_uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true), set_config('request.jwt.claim.sub', p_uid::text, true);
$$;
create or replace function tests.anon() returns void language sql as $$
  select set_config('role', 'anon', true), set_config('request.jwt.claim.sub', '', true);
$$;
create or replace function tests.service() returns void language sql as $$
  select set_config('role', 'service_role', true), set_config('request.jwt.claim.sub', '', true);
$$;
create or replace function tests.su() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claim.sub', '', true);
$$;
grant execute on all functions in schema tests to public;

-- Fixed ids make failures readable.
create or replace function tests.id(p_name text) returns uuid language sql immutable as $$
  select case p_name
    when 'customer'  then '00000000-0000-0000-0000-00000000c001'
    when 'customer2' then '00000000-0000-0000-0000-00000000c002'
    when 'vendor'    then '00000000-0000-0000-0000-00000000d001'
    when 'vendor2'   then '00000000-0000-0000-0000-00000000d002'
    when 'partner1'  then '00000000-0000-0000-0000-00000000e001'
    when 'partner2'  then '00000000-0000-0000-0000-00000000e002'
    when 'partner3'  then '00000000-0000-0000-0000-00000000e003'
    when 'admin'     then '00000000-0000-0000-0000-00000000a001'
  end::uuid
$$;

-- Builds the cast: users, roles, an approved vendor with an always-open store
-- in Kamareddy, one product (10 in stock), three approved partners, an admin.
create or replace function tests.seed_world() returns void language plpgsql as $$
declare
  v_store uuid;
  v_product uuid;
  v_hours jsonb := '{"mon":[{"open":"00:00","close":"23:59"}],"tue":[{"open":"00:00","close":"23:59"}],
                     "wed":[{"open":"00:00","close":"23:59"}],"thu":[{"open":"00:00","close":"23:59"}],
                     "fri":[{"open":"00:00","close":"23:59"}],"sat":[{"open":"00:00","close":"23:59"}],
                     "sun":[{"open":"00:00","close":"23:59"}]}';
begin
  insert into auth.users (id, phone) values
    (tests.id('customer'), '919000000001'), (tests.id('customer2'), '919000000002'),
    (tests.id('vendor'), '919000000003'), (tests.id('vendor2'), '919000000004'),
    (tests.id('partner1'), '919000000005'), (tests.id('partner2'), '919000000006'),
    (tests.id('partner3'), '919000000007'), (tests.id('admin'), '919000000008');

  -- admin bootstrap (in production: SQL editor once, then admin_set_admin_role)
  update public.profiles set role = 'admin', full_name = 'Ops Admin' where id = tests.id('admin');
  insert into public.admin_users (id, admin_role) values (tests.id('admin'), 'super_admin');

  perform tests.login(tests.id('customer'));  perform public.choose_role('customer');
  perform tests.login(tests.id('customer2')); perform public.choose_role('customer');
  perform tests.login(tests.id('vendor'));    perform public.choose_role('vendor');
  perform public.register_vendor('Ravi Kumar', 'Sri Lakshmi Kirana', (select id from public.categories where slug = 'grocery'));
  perform tests.login(tests.id('vendor2'));   perform public.choose_role('vendor');
  perform public.register_vendor('Other Owner', 'Other Shop', (select id from public.categories where slug = 'bakery'));

  perform tests.login(tests.id('partner1')); perform public.choose_role('delivery_partner');
  perform public.register_delivery_partner('Suresh Reddy', 'motorcycle', 'TS 16 AB 1234', 'TS16 20190012345');
  perform tests.login(tests.id('partner2')); perform public.choose_role('delivery_partner');
  perform public.register_delivery_partner('Mahesh Goud', 'scooter', 'TS16CD5678', 'TS1620200054321');
  perform tests.login(tests.id('partner3')); perform public.choose_role('delivery_partner');
  perform public.register_delivery_partner('Anil', 'bicycle');

  perform tests.login(tests.id('vendor'));
  insert into public.stores (vendor_id, name, category_id, phone, address_line, locality, city, state, pincode,
                             location, opening_hours, delivery_radius_km, min_order_value, avg_prep_minutes)
  values (tests.id('vendor'), 'Sri Lakshmi Kirana', (select id from public.categories where slug = 'grocery'),
          '+919000000003', 'Station Road', 'Station Road', 'Kamareddy', 'Telangana', '503111',
          public._point(18.3203, 78.3370), v_hours, 5, 50, 15)
  returning id into v_store;
  insert into public.products (store_id, category_id, name, name_te)
  values (v_store, (select id from public.categories where slug = 'staples'), 'Sona Masoori Rice', 'సోనా మసూరి బియ్యం')
  returning id into v_product;
  insert into public.product_variants (product_id, label, unit, unit_quantity, price, sale_price, is_default)
  values (v_product, '5 kg', 'kg', 5, 400, 380, true);
  update public.inventory set quantity = 10 where store_id = v_store;

  -- admin approves vendor, store and partners
  perform tests.login(tests.id('admin'));
  update public.vendors set status = 'approved' where id = tests.id('vendor');
  update public.stores set status = 'approved' where id = v_store;
  update public.delivery_partners set status = 'approved'
   where id in (tests.id('partner1'), tests.id('partner2'), tests.id('partner3'));

  -- customer address ≈1.2 km from the store
  perform tests.login(tests.id('customer'));
  insert into public.addresses (user_id, label, contact_name, contact_phone, line1, locality, city, state, pincode, location, is_default)
  values (tests.id('customer'), 'Home', 'Lakshmi', '+919000000001', 'H.No 4-12, Vidyanagar', 'Vidyanagar',
          'Kamareddy', 'Telangana', '503111', public._point(18.3300, 78.3420), true);
  perform tests.su();
end $$;
grant execute on all functions in schema tests to public;

create or replace function tests.store() returns uuid language sql stable as $$
  select id from public.stores where vendor_id = tests.id('vendor') limit 1
$$;
create or replace function tests.variant() returns uuid language sql stable as $$
  select v.id from public.product_variants v join public.products p on p.id = v.product_id
   where p.store_id = tests.store() limit 1
$$;
create or replace function tests.address() returns uuid language sql stable as $$
  select id from public.addresses where user_id = tests.id('customer') limit 1
$$;
grant execute on all functions in schema tests to public;
