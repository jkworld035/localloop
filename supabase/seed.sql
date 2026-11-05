-- LOCAL DEVELOPMENT ONLY — loaded by `supabase db reset`, never by
-- `supabase db push`. Everything here is flagged is_demo and labelled
-- "[Demo]"; production hides it (app_settings.show_demo_data = false).
--
-- Demo sign-ins (with the test OTPs in config.toml, code 123456):
--   +91 90000 00001  customer
--   +91 90000 00003  vendor   (approved, one demo shop)
--   +91 90000 00005  delivery partner (approved)

update public.app_settings set value = 'true' where key in ('show_demo_data', 'test_payments_enabled');

insert into auth.users (id, instance_id, aud, role, phone, phone_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '919000000001', now(), now(), now(), '{"provider":"phone","providers":["phone"]}', '{}'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '919000000003', now(), now(), now(), '{"provider":"phone","providers":["phone"]}', '{}'),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '919000000005', now(), now(), now(), '{"provider":"phone","providers":["phone"]}', '{}')
on conflict (id) do nothing;

update public.profiles set role = 'customer', full_name = '[Demo] Customer' where id = '10000000-0000-0000-0000-000000000001';
insert into public.customers (id) values ('10000000-0000-0000-0000-000000000001') on conflict do nothing;

update public.profiles set role = 'vendor', full_name = '[Demo] Vendor' where id = '10000000-0000-0000-0000-000000000003';
insert into public.vendors (id, owner_name, business_name, business_category_id, status)
values ('10000000-0000-0000-0000-000000000003', 'Demo Owner', '[Demo] Kirana', (select id from public.categories where slug = 'grocery'), 'approved')
on conflict do nothing;

update public.profiles set role = 'delivery_partner', full_name = '[Demo] Partner' where id = '10000000-0000-0000-0000-000000000005';
insert into public.delivery_partners (id, vehicle_type, vehicle_registration, driving_licence, status)
values ('10000000-0000-0000-0000-000000000005', 'motorcycle', 'TS16AB0001', 'TS1620200000001', 'approved')
on conflict do nothing;

with s as (
  insert into public.stores (id, vendor_id, name, name_te, category_id, phone, address_line, locality, city, state, pincode,
                             location, opening_hours, delivery_radius_km, min_order_value, avg_prep_minutes, status, is_demo)
  values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003',
          '[Demo] Kirana', '[డెమో] కిరాణా', (select id from public.categories where slug = 'grocery'),
          '+919000000003', 'Demo address — not a real shop', 'Demo', 'Kamareddy', 'Telangana', '503111',
          public._point(18.3203, 78.3370),
          '{"mon":[{"open":"07:00","close":"22:00"}],"tue":[{"open":"07:00","close":"22:00"}],"wed":[{"open":"07:00","close":"22:00"}],
            "thu":[{"open":"07:00","close":"22:00"}],"fri":[{"open":"07:00","close":"22:00"}],"sat":[{"open":"07:00","close":"22:00"}],
            "sun":[{"open":"08:00","close":"20:00"}]}',
          5, 50, 15, 'approved', true)
  on conflict do nothing returning id
), p as (
  insert into public.products (store_id, category_id, name, name_te)
  select s.id, c.id, x.name, x.name_te
    from s, (values ('staples', '[Demo] Rice', '[డెమో] బియ్యం'), ('dairy-eggs', '[Demo] Milk', '[డెమో] పాలు')) x(cat, name, name_te)
    join public.categories c on c.slug = x.cat
  returning id, name
)
insert into public.product_variants (product_id, label, unit, unit_quantity, price, is_default)
select p.id, case when p.name like '%Rice' then '1 kg' else '500 ml' end,
       case when p.name like '%Rice' then 'kg'::public.product_unit else 'ml'::public.product_unit end,
       case when p.name like '%Rice' then 1 else 500 end,
       case when p.name like '%Rice' then 60 else 30 end, true
  from p;

update public.inventory set quantity = 50 where store_id = '20000000-0000-0000-0000-000000000001';
