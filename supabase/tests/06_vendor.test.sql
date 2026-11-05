-- Phase 3 vendor tools: atomic product editor, dashboard, shop settings boundaries.
begin;
\ir _helpers.sql
select plan(15);

select tests.seed_world();
select tests.store() as store_id \gset
select id as cat from public.categories where slug = 'staples' \gset

-- ── create a product with two sizes ───────────────────────
select tests.login(tests.id('vendor'));
select public.vendor_save_product(:'store_id', null,
  jsonb_build_object('name', 'Toor Dal', 'name_te', 'కంది పప్పు', 'category_id', :'cat', 'is_available', true),
  jsonb_build_array(
    jsonb_build_object('label', '500 g', 'unit', 'g', 'unit_quantity', 500, 'price', 90, 'sale_price', 85, 'stock', 12, 'track_inventory', true),
    jsonb_build_object('label', '1 kg', 'unit', 'kg', 'unit_quantity', 1, 'price', 170, 'stock', 4, 'track_inventory', true))) as pid \gset
select is((select count(*)::int from public.product_variants where product_id = :'pid'), 2, 'product saved with two sizes');
select is((select quantity from public.inventory i join public.product_variants v on v.id = i.variant_id
            where v.product_id = :'pid' and v.label = '500 g'), 12, 'stock set per size');
select is((select label from public.product_variants where product_id = :'pid' and is_default), '500 g', 'first size is the default');

-- ── edit: change price, drop a size, reorder default ──────
select id as v1kg from public.product_variants where product_id = :'pid' and label = '1 kg' \gset
select lives_ok(format($$ select public.vendor_save_product(%L, %L,
  jsonb_build_object('name', 'Toor Dal', 'category_id', %L),
  jsonb_build_array(jsonb_build_object('id', %L, 'label', '1 kg', 'unit', 'kg', 'unit_quantity', 1, 'price', 165, 'stock', 9))) $$,
  :'store_id', :'pid', :'cat', :'v1kg'), 'edit product');
select is((select count(*)::int from public.product_variants where product_id = :'pid'), 1, 'removed size is deleted when never ordered');
select is((select price from public.product_variants where id = :'v1kg'), 165.00, 'price updated in place (same size id)');
select is((select is_default from public.product_variants where id = :'v1kg'), true, 'remaining size becomes default');

-- ── validation is atomic ──────────────────────────────────
select throws_ok(format($$ select public.vendor_save_product(%L, %L,
  jsonb_build_object('name', 'Toor Dal', 'category_id', %L),
  jsonb_build_array(jsonb_build_object('id', %L, 'label', '1 kg', 'unit', 'kg', 'unit_quantity', 1, 'price', 100, 'sale_price', 120, 'stock', 9))) $$,
  :'store_id', :'pid', :'cat', :'v1kg'), 'P0001', 'invalid_product_values', 'sale price above MRP refused');
select is((select price from public.product_variants where id = :'v1kg'), 165.00, 'failed save changes nothing');
select throws_ok(format($$ select public.vendor_save_product(%L, null, jsonb_build_object('name', 'X Y', 'category_id', %L),
  jsonb_build_array(jsonb_build_object('label', 'a', 'unit', 'g', 'unit_quantity', 1, 'price', 5, 'stock', 1),
                    jsonb_build_object('label', 'a', 'unit', 'g', 'unit_quantity', 2, 'price', 6, 'stock', 1))) $$, :'store_id', :'cat'),
  'P0001', 'duplicate_size_label', 'duplicate size names refused');

-- ── ownership ─────────────────────────────────────────────
select tests.login(tests.id('vendor2'));
select throws_ok(format($$ select public.vendor_save_product(%L, %L, jsonb_build_object('name', 'Hack', 'category_id', %L),
  jsonb_build_array(jsonb_build_object('label', 'x', 'unit', 'g', 'unit_quantity', 1, 'price', 1, 'stock', 1))) $$,
  :'store_id', :'pid', :'cat'), 'P0001', 'store_unavailable', 'another vendor cannot edit the product');
select throws_ok(format($$ select public.vendor_dashboard(%L) $$, :'store_id'), 'P0001', 'store_unavailable', 'or read the dashboard');

-- ── dashboard + shop switches ─────────────────────────────
select tests.login(tests.id('vendor'));
select is((public.vendor_dashboard(:'store_id') ->> 'new_orders')::int, 0, 'dashboard loads');
select lives_ok(format($$ update public.stores set is_accepting_orders = false where id = %L $$, :'store_id'), 'vendor pauses orders');
select public.vendor_save_product(:'store_id', :'pid', jsonb_build_object('name', 'Toor Dal', 'category_id', :'cat'),
  jsonb_build_array(jsonb_build_object('id', :'v1kg', 'label', '1 kg', 'unit', 'kg', 'unit_quantity', 1, 'price', 165, 'stock', 3)));
select is((public.vendor_dashboard(:'store_id') ->> 'low_stock')::int, 1, 'low stock counted on the dashboard');

select * from finish();
rollback;
