-- Master product catalogue: admins add common products once; shop owners
-- find them while typing and add them with photos, description and benefits.
begin;
\ir _helpers.sql
select plan(15);

select tests.seed_world();
select id as staples from public.categories where slug = 'staples' \gset

-- ── admin adds templates ──────────────────────────────────
select tests.login(tests.id('admin'));
insert into public.catalog_templates (category_id, name, name_te, brand, description, highlights, highlights_te, sizes, image_paths)
values (:'staples', 'Aashirvaad Whole Wheat Atta', 'ఆశీర్వాద్ గోధుమ పిండి', 'Aashirvaad', 'Made from whole wheat grains.',
        '{"100% whole wheat","Soft rotis"}', '{"100% గోధుమ"}',
        '[{"label":"1 kg","unit":"kg","unit_quantity":1,"mrp":72},{"label":"5 kg","unit":"kg","unit_quantity":5,"mrp":310}]',
        '{"catalog/t1/a.jpg","catalog/t1/b.jpg"}')
returning id as t1 \gset
insert into public.catalog_templates (category_id, name, is_active) values (:'staples', 'Atta Hidden Brand', false);
select ok(exists (select 1 from public.admin_audit_logs where entity_type = 'catalog_templates'), 'catalogue changes audited');

-- ── vendor search ─────────────────────────────────────────
select tests.login(tests.id('vendor'));
select is((select name from public.search_catalog_templates('ashirvad atta') limit 1), 'Aashirvaad Whole Wheat Atta', 'misspelt name still found');
select ok(not exists (select 1 from public.search_catalog_templates('atta hidden', 20) where name = 'Atta Hidden Brand'), 'inactive templates are hidden');
select ok(exists (select 1 from public.search_catalog_templates('గోధుమ', 20) where id = :'t1'), 'found by Telugu name');
select is((select count(*)::int from public.search_catalog_templates('a')), 0, 'one letter is too short to search');
select ok(not exists (select 1 from public.catalog_templates where not is_active), 'vendors read only active templates');
select ok((select count(*) from public.catalog_templates) >= 150, 'starter catalogue is loaded');
select throws_ok(format($$ insert into public.catalog_templates (category_id, name) values (%L, 'Vendor Made') $$, :'staples'),
  '42501', null, 'shop owners cannot add to the catalogue');
with u as (update public.catalog_templates set name = 'Hacked' returning 1)
select is((select count(*)::int from u), 0, 'shop owners cannot change the catalogue');

-- ── adding a product from a template ──────────────────────
select public.vendor_save_product(tests.store(), null,
  jsonb_build_object('name', 'Aashirvaad Whole Wheat Atta', 'category_id', :'staples', 'description', 'Made from whole wheat grains.',
                     'highlights', jsonb_build_array('100% whole wheat', 'Soft rotis', '  '), 'template_id', :'t1'),
  '[{"label":"1 kg","unit":"kg","unit_quantity":1,"price":72,"sale_price":68,"stock":10}]') as p1 \gset
select is((select count(*)::int from public.product_images where product_id = :'p1'), 2, 'catalogue photos attached');
select is((select highlights from public.products where id = :'p1'), '{"100% whole wheat","Soft rotis"}'::text[], 'benefits saved, blanks dropped');
select is((select template_id from public.products where id = :'p1'), :'t1'::uuid, 'product remembers its template');
select tests.su();
select is((select use_count from public.catalog_templates where id = :'t1'), 1, 'template use counted');

-- Editing doesn't attach the photos again.
select tests.login(tests.id('vendor'));
select public.vendor_save_product(tests.store(), :'p1',
  jsonb_build_object('name', 'Aashirvaad Atta', 'category_id', :'staples', 'template_id', :'t1'),
  (select jsonb_agg(jsonb_build_object('id', id, 'label', label, 'unit', unit, 'unit_quantity', unit_quantity, 'price', 75, 'stock', 5))
     from public.product_variants where product_id = :'p1'));
select is((select count(*)::int from public.product_images where product_id = :'p1'), 2, 'editing keeps the same photos');

-- Customers can't search the catalogue.
select tests.login(tests.id('customer'));
select is((select count(*)::int from public.search_catalog_templates('atta')), 0, 'customers get nothing from catalogue search');

select * from finish();
rollback;
