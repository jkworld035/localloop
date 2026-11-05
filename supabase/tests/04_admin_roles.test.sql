-- Admin role permissions, exercising exactly the rows the admin dashboard reads and writes.
begin;
\ir _helpers.sql
select plan(14);

select tests.seed_world();
insert into auth.users (id, phone) values
  ('00000000-0000-0000-0000-00000000a002', '919000000011'),
  ('00000000-0000-0000-0000-00000000a003', '919000000012');
select tests.login(tests.id('admin'));
select public.admin_set_admin_role('00000000-0000-0000-0000-00000000a002', 'operations');
select public.admin_set_admin_role('00000000-0000-0000-0000-00000000a003', 'finance');
-- a fresh pending vendor for the approvals page
select tests.su();
update public.vendors set status = 'pending' where id = tests.id('vendor2');

-- ── operations ────────────────────────────────────────────
select tests.login('00000000-0000-0000-0000-00000000a002');
select is((select a.admin_role::text from public.admin_users a join public.profiles p on p.id = a.id where a.id = auth.uid()),
          'operations', 'dashboard layout can resolve the operations admin (requireAdmin query)');
select is((select count(*)::int from public.vendors v join public.profiles p on p.id = v.id where v.status = 'pending'), 1,
          'approvals page: pending vendor and owner phone are readable');
select is((select count(*)::int from public.delivery_partners where status = 'approved'), 3, 'operations can list partners');
select lives_ok($$ update public.vendors set status = 'approved' where id = tests.id('vendor2') $$, 'operations approves a vendor');
select tests.su();
select is((select reviewed_by from public.vendors where id = tests.id('vendor2')), '00000000-0000-0000-0000-00000000a002'::uuid,
          'reviewer is stamped by the guard trigger');
select is((select count(*)::int from public.notifications where user_id = tests.id('vendor2') and type = 'vendors_approved'), 1,
          'vendor is notified of approval');
select tests.login('00000000-0000-0000-0000-00000000a002');
select is((select count(*)::int from public.app_settings), (select count(*)::int from public.app_settings), 'operations can read settings');
update public.app_settings set value = '0.5' where key = 'commission_rate_default';
select tests.su();
select is((select value #>> '{}' from public.app_settings where key = 'commission_rate_default'), '0.10',
          'operations cannot change commercial settings (RLS filters the update)');

-- ── finance ───────────────────────────────────────────────
select tests.login('00000000-0000-0000-0000-00000000a003');
select is((select a.admin_role::text from public.admin_users a join public.profiles p on p.id = a.id where a.id = auth.uid()),
          'finance', 'dashboard layout can resolve the finance admin');
select ok((public.admin_overview() ->> 'customers')::int >= 2, 'finance reads overview metrics');
select is((select count(*)::int from public.vendors), 0, 'finance cannot see vendor applications');
select throws_ok($$ select public.admin_set_admin_role(tests.id('customer'), 'support') $$, 'P0001', 'forbidden',
                 'only super admins grant admin roles');

-- ── super admin ───────────────────────────────────────────
select tests.login(tests.id('admin'));
update public.app_settings set value = '0.08' where key = 'commission_rate_default';
select tests.su();
select is((select value #>> '{}' from public.app_settings where key = 'commission_rate_default'), '0.08',
          'super admin changes the commission rate');
select ok(exists (select 1 from public.admin_audit_logs where entity_type = 'app_settings' and entity_id = 'commission_rate_default'),
          'setting change is in the audit log');

select * from finish();
rollback;
