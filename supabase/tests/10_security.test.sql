-- Release gate: structural security rules that must hold for every table and
-- function, now and in future migrations.
begin;
\ir _helpers.sql
select plan(9);

-- Functions any signed-out caller may run: public discovery RPCs, the crash
-- reporter, and the helpers that Row Level Security policies call.
create temp table anon_allowed (name text) on commit drop;
insert into anon_allowed values
  ('nearby_stores'), ('search_products'), ('area_status'), ('estimate_delivery_minutes'), ('store_summary'),
  ('store_reviews'), ('report_client_error'),
  ('admin_can'), ('is_admin'), ('current_app_role'), ('can_view_order'), ('owns_store'), ('owns_product'),
  ('store_is_public'), ('product_is_public'), ('demo_data_visible'), ('is_open_at'), ('valid_opening_hours'),
  ('_point'), ('_uuid_or_null');
grant select on anon_allowed to public;

create temp view our_functions as
  select p.oid, p.proname, p.prosecdef, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');

select is(
  (select string_agg(c.relname, ', ') from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  null, 'every table has Row Level Security enabled');

select is(
  (select string_agg(proname, ', ') from our_functions
    where prosecdef and not exists (select 1 from unnest(coalesce(proconfig, '{}')) c where c like 'search_path=%')),
  null, 'every SECURITY DEFINER function pins its search_path');

select is(
  (select string_agg(proname, ', ' order by proname) from our_functions
    where has_function_privilege('anon', oid, 'EXECUTE') and proname not in (select name from anon_allowed)),
  null, 'signed-out callers can run only the allowlisted functions');

select is(
  (select string_agg(proname, ', ' order by proname) from our_functions
    where has_function_privilege('authenticated', oid, 'EXECUTE')
      and proname in ('dispatch_order_internal', 'expire_offers_and_redispatch', 'purge_old_locations', 'record_route',
                      'eta_context', 'notify', '_audit', '_require_admin', '_restock_order', '_close_payment_on_cancel',
                      '_cancel_open_assignments', 'notifications_dispatch_push', 'handle_new_auth_user')),
  null, 'internal and server-only functions are not callable from the apps');

select is(
  (select string_agg(distinct table_name || ':' || privilege_type, ', ') from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public' and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')),
  null, 'signed-out callers cannot write to any table');

select is(
  (select string_agg(distinct table_name, ', ') from information_schema.role_table_grants
    where grantee = 'authenticated' and table_schema = 'public' and privilege_type = 'TRUNCATE'),
  null, 'nobody can TRUNCATE (it bypasses RLS)');

select is((select count(*)::int from storage.buckets where id in ('vendor-documents', 'partner-documents') and public), 0,
          'verification document buckets are private');

-- Crash reports
select tests.seed_world();
select tests.anon();
select public.report_client_error('1.0.0', 'android', 'Crash calling 9876543210', 'at Foo (+91 9876543210)', 'home', true);
select tests.su();
select is((select message || ' | ' || stack from public.client_errors order by id desc limit 1),
          'Crash calling [phone] | at Foo ([phone])', 'phone numbers are masked in crash reports');
select tests.login(tests.id('customer'));
select is((select count(*)::int from public.client_errors), 0, 'customers cannot read crash reports');

select * from finish();
rollback;
