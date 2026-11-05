-- LocalLoop · 0017 · vendor tools (Phase 3)

-- Creates or updates a product with all its sizes and stock in one
-- transaction, so a shop never shows a product with missing prices or stock.
--
-- p_product:  {"name","name_te","description","category_id","is_available"}
-- p_variants: [{"id"?,"label","unit","unit_quantity","price","sale_price"?,"stock","track_inventory","is_active"}]
-- Sizes left out of p_variants are removed (or deactivated if they were ever ordered).
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

  if v_pid is null then
    insert into public.products (store_id, category_id, name, name_te, description, is_available)
    values (p_store_id, (p_product ->> 'category_id')::uuid, trim(p_product ->> 'name'),
            coalesce(trim(p_product ->> 'name_te'), ''), coalesce(trim(p_product ->> 'description'), ''),
            coalesce((p_product ->> 'is_available')::boolean, true))
    returning id into v_pid;
  else
    update public.products
       set category_id = (p_product ->> 'category_id')::uuid,
           name = trim(p_product ->> 'name'),
           name_te = coalesce(trim(p_product ->> 'name_te'), ''),
           description = coalesce(trim(p_product ->> 'description'), ''),
           is_available = coalesce((p_product ->> 'is_available')::boolean, true),
           is_active = true
     where id = v_pid and store_id = p_store_id;
    if not found then raise exception 'product_not_found' using errcode = 'P0001'; end if;
  end if;

  -- Clear defaults first so the partial unique index allows re-assigning it.
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

  -- Sizes removed in the editor: delete if never ordered, otherwise keep for order history but hide.
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

-- Figures for the vendor home screen. "Today" is the Asia/Kolkata day.
create or replace function public.vendor_dashboard(p_store_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := public._require_role('vendor');
  v_today timestamptz := date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
begin
  if not exists (select 1 from public.stores where id = p_store_id and vendor_id = v_uid) then
    raise exception 'store_unavailable' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'new_orders', (select count(*) from public.orders where store_id = p_store_id and status = 'placed'),
    'in_progress', (select count(*) from public.orders where store_id = p_store_id and status in ('accepted', 'preparing')),
    'ready', (select count(*) from public.orders where store_id = p_store_id and status = 'ready_for_pickup'),
    'out_for_delivery', (select count(*) from public.orders where store_id = p_store_id and status = 'picked_up'),
    'orders_today', (select count(*) from public.orders where store_id = p_store_id and placed_at >= v_today),
    'delivered_today', (select count(*) from public.orders where store_id = p_store_id and status = 'delivered' and delivered_at >= v_today),
    'sales_today', (select coalesce(sum(subtotal), 0) from public.orders
                     where store_id = p_store_id and status = 'delivered' and delivered_at >= v_today),
    'sales_7d', (select coalesce(sum(subtotal), 0) from public.orders
                  where store_id = p_store_id and status = 'delivered' and delivered_at >= v_today - interval '6 days'),
    'payout_pending', (select coalesce(sum(vendor_payout), 0) from public.commissions where store_id = p_store_id and settled_at is null),
    'low_stock', (select count(*) from public.inventory i join public.product_variants v on v.id = i.variant_id
                   join public.products p on p.id = v.product_id
                   where i.store_id = p_store_id and i.track_inventory and i.quantity <= i.low_stock_threshold
                     and v.is_active and p.is_active),
    'top_products_7d', coalesce((select jsonb_agg(t) from (
        select oi.product_name as name, sum(oi.quantity)::int as quantity
          from public.order_items oi join public.orders o on o.id = oi.order_id
         where o.store_id = p_store_id and o.status = 'delivered' and o.delivered_at >= v_today - interval '6 days'
         group by oi.product_name order by sum(oi.quantity) desc limit 5) t), '[]'::jsonb),
    'rating_avg', (select rating_avg from public.stores where id = p_store_id),
    'rating_count', (select rating_count from public.stores where id = p_store_id)
  );
end $$;

grant execute on function
  public.vendor_save_product(uuid, uuid, jsonb, jsonb),
  public.vendor_dashboard(uuid)
to authenticated;

-- Owners can remove their own verification files (the document row can only be
-- deleted while pending, see 0007).
create policy "vendor docs owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'vendor-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "partner docs owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'partner-documents' and (storage.foldername(name))[1] = auth.uid()::text);
