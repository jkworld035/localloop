-- LocalLoop · 0025 · master product catalogue
-- LocalLoop's own list of common products (photo, English/Telugu name and
-- description, benefits, usual sizes and MRP). Shop owners pick one while
-- typing a product name; the form fills in and they only set price and stock.
-- Photos live in the public product-media bucket under catalog/<template id>/…

create table public.catalog_templates (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories (id),
  name text not null check (char_length(name) between 2 and 120),
  name_te text not null default '' check (char_length(name_te) <= 120),
  brand text not null default '' check (char_length(brand) <= 60),
  description text not null default '' check (char_length(description) <= 2000),
  description_te text not null default '' check (char_length(description_te) <= 2000),
  highlights text[] not null default '{}' check (cardinality(highlights) <= 8),
  highlights_te text[] not null default '{}' check (cardinality(highlights_te) <= 8),
  -- [{"label":"1 kg","unit":"kg","unit_quantity":1,"mrp":72}]
  sizes jsonb not null default '[]' check (jsonb_typeof(sizes) = 'array' and jsonb_array_length(sizes) <= 10),
  image_paths text[] not null default '{}' check (cardinality(image_paths) <= 5),
  is_active boolean not null default true,
  use_count integer not null default 0,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index catalog_templates_name_trgm on public.catalog_templates using gin (name extensions.gin_trgm_ops);
create index catalog_templates_name_te_trgm on public.catalog_templates using gin (name_te extensions.gin_trgm_ops);
create index catalog_templates_brand_trgm on public.catalog_templates using gin (brand extensions.gin_trgm_ops);
create trigger catalog_templates_updated_at before update on public.catalog_templates
  for each row execute function public.set_updated_at();
create trigger catalog_templates_audit after insert or update or delete on public.catalog_templates
  for each row execute function public.audit_admin_write();

alter table public.catalog_templates enable row level security;
grant select on public.catalog_templates to authenticated;
grant insert, update, delete on public.catalog_templates to authenticated;
create policy catalog_templates_read on public.catalog_templates for select to authenticated
  using ((is_active and public.current_app_role() in ('vendor', 'admin')) or public.admin_can('catalog'));
create policy catalog_templates_admin_write on public.catalog_templates for insert to authenticated
  with check (public.admin_can('catalog'));
create policy catalog_templates_admin_update on public.catalog_templates for update to authenticated
  using (public.admin_can('catalog')) with check (public.admin_can('catalog'));
create policy catalog_templates_admin_delete on public.catalog_templates for delete to authenticated
  using (public.admin_can('catalog'));

-- Catalogue photos: admins with catalogue access manage product-media/catalog/…
create policy "catalog media admin write" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-media' and (storage.foldername(name))[1] = 'catalog' and public.admin_can('catalog'));
create policy "catalog media admin update" on storage.objects for update to authenticated
  using (bucket_id = 'product-media' and (storage.foldername(name))[1] = 'catalog' and public.admin_can('catalog'));
create policy "catalog media admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'product-media' and (storage.foldername(name))[1] = 'catalog' and public.admin_can('catalog'));

-- Products gain what templates carry: Telugu description and benefit points.
alter table public.products
  add column description_te text not null default '' check (char_length(description_te) <= 2000),
  add column highlights text[] not null default '{}' check (cardinality(highlights) <= 8),
  add column highlights_te text[] not null default '{}' check (cardinality(highlights_te) <= 8),
  add column template_id uuid references public.catalog_templates (id) on delete set null;

-- Type-ahead for the add-product screen: matches English, Telugu and brand,
-- best match first, most-used breaking ties.
create or replace function public.search_catalog_templates(p_query text, p_limit int default 8)
returns setof public.catalog_templates
language sql stable security definer set search_path = public, extensions as $$
  select t.* from public.catalog_templates t
   where t.is_active
     and (public.current_app_role() in ('vendor', 'admin'))
     and char_length(trim(coalesce(p_query, ''))) >= 2
     and (t.name ilike '%' || trim(p_query) || '%'
          or t.name_te ilike '%' || trim(p_query) || '%'
          or t.brand ilike '%' || trim(p_query) || '%'
          or similarity(t.name, trim(p_query)) > 0.3)
   order by greatest(similarity(t.name, trim(p_query)), similarity(t.name_te, trim(p_query)),
                     case when t.name ilike trim(p_query) || '%' then 1 else 0 end) desc,
            t.use_count desc, t.name
   limit least(greatest(coalesce(p_limit, 8), 1), 20)
$$;

-- Saving a product: the new fields, and on creation from a template its photos
-- are attached (shared catalogue files, not copies) and its use counted.
create or replace function public.vendor_save_product(
  p_store_id uuid, p_product_id uuid, p_product jsonb, p_variants jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._require_role('vendor');
  v_pid uuid := p_product_id;
  v_keep uuid[] := '{}';
  v_first boolean := true;
  v jsonb;
  v_vid uuid;
  v_template public.catalog_templates;
  v_hl text[] := coalesce((select array_agg(left(trim(x), 120)) from jsonb_array_elements_text(coalesce(p_product -> 'highlights', '[]')) x where trim(x) <> ''), '{}');
  v_hl_te text[] := coalesce((select array_agg(left(trim(x), 120)) from jsonb_array_elements_text(coalesce(p_product -> 'highlights_te', '[]')) x where trim(x) <> ''), '{}');
begin
  if not exists (select 1 from public.stores where id = p_store_id and vendor_id = v_uid) then
    raise exception 'store_unavailable' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_variants) <> 'array' or jsonb_array_length(p_variants) = 0 then
    raise exception 'variant_required' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.categories where id = (p_product ->> 'category_id')::uuid and kind = 'product' and is_active) then
    raise exception 'invalid_category' using errcode = 'P0001';
  end if;
  if nullif(p_product ->> 'template_id', '') is not null then
    select * into v_template from public.catalog_templates where id = (p_product ->> 'template_id')::uuid and is_active;
  end if;

  if v_pid is null then
    insert into public.products (store_id, category_id, name, name_te, description, description_te, highlights, highlights_te,
                                 is_available, template_id)
    values (p_store_id, (p_product ->> 'category_id')::uuid, trim(p_product ->> 'name'),
            coalesce(trim(p_product ->> 'name_te'), ''), coalesce(trim(p_product ->> 'description'), ''),
            coalesce(trim(p_product ->> 'description_te'), ''), v_hl, v_hl_te,
            coalesce((p_product ->> 'is_available')::boolean, true), v_template.id)
    returning id into v_pid;
    if v_template.id is not null then
      insert into public.product_images (product_id, storage_path, sort_order)
      select v_pid, p.path, (p.ord - 1)::smallint from unnest(v_template.image_paths) with ordinality as p(path, ord);
      update public.catalog_templates set use_count = use_count + 1 where id = v_template.id;
    end if;
  else
    update public.products
       set category_id = (p_product ->> 'category_id')::uuid,
           name = trim(p_product ->> 'name'),
           name_te = coalesce(trim(p_product ->> 'name_te'), ''),
           description = coalesce(trim(p_product ->> 'description'), ''),
           description_te = coalesce(trim(p_product ->> 'description_te'), ''),
           highlights = v_hl,
           highlights_te = v_hl_te,
           is_available = coalesce((p_product ->> 'is_available')::boolean, true),
           is_active = true
     where id = v_pid and store_id = p_store_id;
    if not found then raise exception 'product_not_found' using errcode = 'P0001'; end if;
  end if;

  update public.product_variants set is_default = false where product_id = v_pid and is_default;

  for v in select * from jsonb_array_elements(p_variants) loop
    v_vid := nullif(v ->> 'id', '')::uuid;
    if v_vid is not null and exists (select 1 from public.product_variants where id = v_vid and product_id = v_pid) then
      update public.product_variants
         set label = trim(v ->> 'label'), unit = (v ->> 'unit')::public.product_unit,
             unit_quantity = (v ->> 'unit_quantity')::numeric, price = (v ->> 'price')::numeric,
             sale_price = nullif(v ->> 'sale_price', '')::numeric,
             is_active = coalesce((v ->> 'is_active')::boolean, true), is_default = v_first
       where id = v_vid;
    else
      insert into public.product_variants (product_id, label, unit, unit_quantity, price, sale_price, is_active, is_default)
      values (v_pid, trim(v ->> 'label'), (v ->> 'unit')::public.product_unit, (v ->> 'unit_quantity')::numeric,
              (v ->> 'price')::numeric, nullif(v ->> 'sale_price', '')::numeric,
              coalesce((v ->> 'is_active')::boolean, true), v_first)
      returning id into v_vid;
    end if;
    update public.inventory
       set quantity = greatest(0, coalesce((v ->> 'stock')::int, 0)),
           track_inventory = coalesce((v ->> 'track_inventory')::boolean, true)
     where variant_id = v_vid;
    v_keep := v_keep || v_vid;
    v_first := false;
  end loop;

  update public.product_variants pv set is_active = false, is_default = false
   where pv.product_id = v_pid and pv.id <> all (v_keep)
     and exists (select 1 from public.order_items oi where oi.variant_id = pv.id);
  delete from public.product_variants pv
   where pv.product_id = v_pid and pv.id <> all (v_keep)
     and not exists (select 1 from public.order_items oi where oi.variant_id = pv.id);

  return v_pid;
exception when unique_violation then
  raise exception 'duplicate_size_label' using errcode = 'P0001';
when check_violation then
  raise exception 'invalid_product_values' using errcode = 'P0001', detail = sqlerrm;
end $$;

revoke execute on function public.search_catalog_templates(text, int) from public, anon;
grant execute on function public.search_catalog_templates(text, int) to authenticated;
revoke execute on function public.vendor_save_product(uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.vendor_save_product(uuid, uuid, jsonb, jsonb) to authenticated;
