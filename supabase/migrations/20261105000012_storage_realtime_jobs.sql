-- LocalLoop · 0012 · storage buckets, realtime publication, scheduled jobs, push trigger

-- ───────────────────────── storage ─────────────────────────
-- Public media is served from the CDN; verification documents are private and
-- readable only by their owner and administrators (via signed URLs).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars',            'avatars',            true,  2097152, array['image/jpeg','image/png','image/webp']),
  ('store-media',        'store-media',        true,  5242880, array['image/jpeg','image/png','image/webp']),
  ('product-media',      'product-media',      true,  5242880, array['image/jpeg','image/png','image/webp']),
  ('vendor-documents',   'vendor-documents',   false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf']),
  ('partner-documents',  'partner-documents',  false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

create or replace function public._uuid_or_null(p text) returns uuid
language plpgsql immutable as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

-- Paths: avatars/<user_id>/…, store-media/<store_id>/…, product-media/<store_id>/<product_id>/…,
--        vendor-documents/<vendor_id>/…, partner-documents/<partner_id>/…
create policy "public media read" on storage.objects for select
  using (bucket_id in ('avatars', 'store-media', 'product-media'));

create policy "avatar owner write" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar owner update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "store media vendor write" on storage.objects for insert to authenticated
  with check (bucket_id in ('store-media', 'product-media')
              and public.owns_store(public._uuid_or_null((storage.foldername(name))[1])));
create policy "store media vendor update" on storage.objects for update to authenticated
  using (bucket_id in ('store-media', 'product-media')
         and public.owns_store(public._uuid_or_null((storage.foldername(name))[1])));
create policy "store media vendor delete" on storage.objects for delete to authenticated
  using (bucket_id in ('store-media', 'product-media')
         and public.owns_store(public._uuid_or_null((storage.foldername(name))[1])));

create policy "vendor docs owner write" on storage.objects for insert to authenticated
  with check (bucket_id = 'vendor-documents' and (storage.foldername(name))[1] = auth.uid()::text
              and public.current_app_role() = 'vendor');
create policy "vendor docs read" on storage.objects for select to authenticated
  using (bucket_id = 'vendor-documents'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.admin_can('vendors')));

create policy "partner docs owner write" on storage.objects for insert to authenticated
  with check (bucket_id = 'partner-documents' and (storage.foldername(name))[1] = auth.uid()::text
              and public.current_app_role() = 'delivery_partner');
create policy "partner docs read" on storage.objects for select to authenticated
  using (bucket_id = 'partner-documents'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.admin_can('partners')));

-- ───────────────────────── realtime ─────────────────────────
-- postgres_changes respects RLS, so each subscriber only receives rows they
-- may read (e.g. a customer receives their assignment row only while picked_up).
alter publication supabase_realtime add table
  public.orders, public.order_status_history, public.delivery_assignments, public.notifications, public.stores;

-- ───────────────────────── scheduled jobs (pg_cron) ─────────────────────────
-- Enable pg_cron in Dashboard → Database → Extensions before applying in
-- production. Locally (or without pg_cron) this block is skipped.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('localloop-redispatch', '30 seconds', 'select public.expire_offers_and_redispatch()');
    perform cron.schedule('localloop-purge-locations', '17 3 * * *', 'select public.purge_old_locations()');
  else
    raise notice 'pg_cron not installed — schedule expire_offers_and_redispatch() and purge_old_locations() manually';
  end if;
end $$;

-- ───────────────────────── push delivery trigger (pg_net) ─────────────────────────
-- Calls the send-push edge function for each new notification. Requires
-- pg_net and two Vault secrets: `project_url` and `service_role_key`
-- (see docs/setup.md). Failures never block the originating transaction;
-- unsent notifications are retried by the send-push function's sweep.
create or replace function public.notifications_dispatch_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_url text;
  v_key text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then return new; end if;
  begin
    execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'project_url'$q$ into v_url;
    execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'$q$ into v_key;
    if v_url is null or v_key is null then return new; end if;
    execute $q$select net.http_post(url := $1, headers := $2, body := $3)$q$
      using v_url || '/functions/v1/send-push',
            jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
            jsonb_build_object('notification_id', new.id);
  exception when others then
    raise warning 'push dispatch skipped: %', sqlerrm;
  end;
  return new;
end $$;
create trigger notifications_dispatch_push after insert on public.notifications
  for each row execute function public.notifications_dispatch_push();
