-- Delivery-area editor and admin team management.
begin;
\ir _helpers.sql
select plan(14);

select tests.seed_world();
select id as area from public.serviceable_areas where name = 'Kamareddy' \gset
select tests.login(tests.id('admin'));

-- ── areas ─────────────────────────────────────────────────
select is(jsonb_array_length(public.admin_areas()) >= 1, true, 'areas listed for the editor');
select ok((public.admin_areas() -> 0 ->> 'stores_total')::int >= 1, 'shop count per area');

-- A drawn boundary that excludes the seeded shop (store sits near 18.3204, 78.3371).
select throws_ok(format($$ select public.admin_save_area(%L, 'Kamareddy', 'Kamareddy', 'Telangana', 18.32, 78.34, 8,
  '{"type":"Polygon","coordinates":[[[78.30,18.30],[78.40,18.40],[78.30,18.40],[78.40,18.30],[78.30,18.30]]]}'::jsonb, true) $$, :'area'),
  'P0001', 'invalid_area', 'self-crossing boundary is refused');
select throws_ok(format($$ select public.admin_save_area(%L, 'Kamareddy', 'Kamareddy', 'Telangana', 51.5, -0.1, 8) $$, :'area'),
  'P0001', 'invalid_area', 'centre outside India is refused');
select is((public.admin_save_area(:'area', 'Kamareddy', 'Kamareddy', 'Telangana', 18.32, 78.34, 8,
  '{"type":"Polygon","coordinates":[[[78.35,18.33],[78.40,18.33],[78.40,18.38],[78.35,18.38],[78.35,18.33]]]}'::jsonb, true)
  ->> 'stores_moved')::int >= 1, true, 'shops outside the new boundary leave the area');
select tests.anon();
select is((public.area_status(18.3204, 78.3371) ->> 'serviceable')::boolean, false, 'customers there are now outside the area');
select tests.login(tests.id('admin'));
select lives_ok(format($$ select public.admin_save_area(%L, 'Kamareddy', 'Kamareddy', 'Telangana', 18.3204, 78.3371, 8, null, true) $$, :'area'),
  'switching back to centre + radius');
select tests.su();
select is((select serviceable_area_id from public.stores where id = tests.store()), :'area'::uuid, 'shop re-joins the area');
select ok(exists (select 1 from public.admin_audit_logs where action = 'update_area'), 'area changes audited');

-- ── team ──────────────────────────────────────────────────
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000a777', 'ops@example.com');
select tests.login(tests.id('admin'));
select public.admin_grant_role('00000000-0000-0000-0000-00000000a777', 'operations', 'Ops Person');
select is((select admin_role::text from public.admin_users where id = '00000000-0000-0000-0000-00000000a777'), 'operations', 'new admin added');
select is((select full_name from public.profiles where id = '00000000-0000-0000-0000-00000000a777'), 'Ops Person', 'name recorded');
select throws_ok(format($$ select public.admin_grant_role(%L, 'support') $$, tests.id('vendor')), 'P0001', 'role_conflict',
  'a shop owner''s account cannot become an admin');
select throws_ok(format($$ select public.admin_grant_role(%L, null) $$, tests.id('admin')), 'P0001', 'cannot_change_own_role',
  'nobody can remove their own access (a super admin always remains)');
select tests.login('00000000-0000-0000-0000-00000000a777');
select throws_ok($$ select public.admin_team() $$, 'P0001', 'forbidden', 'operations admins cannot manage the team');

select * from finish();
rollback;
