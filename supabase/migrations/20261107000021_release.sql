-- LocalLoop · 0021 · release hardening and crash reports (Phase 7)

-- ───────────────────────── privilege fixes ─────────────────────────
-- Found by the security suite (10_security): these functions from 0016–0018
-- kept PostgreSQL's default EXECUTE-to-PUBLIC, so signed-out callers could
-- reach them. Each checks the caller's role and failed safely, but the rule
-- is an explicit allowlist.
revoke execute on function public.partner_dashboard(), public.vendor_dashboard(uuid),
  public.set_default_address(uuid) from public, anon;
revoke execute on function public.vendor_save_product(uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.partner_dashboard(), public.vendor_dashboard(uuid),
  public.set_default_address(uuid), public.vendor_save_product(uuid, uuid, jsonb, jsonb) to authenticated;

-- New functions still get EXECUTE for PUBLIC by default (changing that
-- globally would also strip it from extensions enabled later), so every
-- migration revokes explicitly and 10_security fails if one forgets.

-- Writes bypass nothing (RLS still applies), but nobody signed out should
-- ever write, and TRUNCATE ignores RLS entirely.
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- ───────────────────────── crash reports ─────────────────────────
-- App crashes and unexpected errors from real phones, so problems on cheap
-- Android devices and patchy networks show up without a third-party service.
-- Stores no personal data beyond the user id: messages are truncated and
-- phone numbers masked before saving.
create table public.client_errors (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles (id) on delete set null,
  app_version text not null check (char_length(app_version) <= 40),
  platform text not null check (platform in ('android', 'ios', 'web')),
  role public.app_role,
  screen text check (char_length(screen) <= 120),
  message text not null check (char_length(message) <= 500),
  stack text check (char_length(stack) <= 4000),
  is_fatal boolean not null default false,
  created_at timestamptz not null default now()
);
create index client_errors_recent on public.client_errors (created_at desc);
alter table public.client_errors enable row level security;
grant select on public.client_errors to authenticated;
create policy client_errors_admin_read on public.client_errors for select to authenticated using (public.is_admin());

create or replace function public.report_client_error(
  p_app_version text, p_platform text, p_message text, p_stack text default null,
  p_screen text default null, p_is_fatal boolean default false
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  mask constant text := '(\+?91[ -]?)?[6-9][0-9]{9}';
begin
  -- Rate limits: 30 per user per hour; 300 per hour from signed-out apps.
  if v_uid is not null then
    if (select count(*) from public.client_errors where user_id = v_uid and created_at > now() - interval '1 hour') >= 30 then return; end if;
  elsif (select count(*) from public.client_errors where user_id is null and created_at > now() - interval '1 hour') >= 300 then
    return;
  end if;
  if p_platform not in ('android', 'ios', 'web') then return; end if;

  insert into public.client_errors (user_id, app_version, platform, role, screen, message, stack, is_fatal)
  values (
    v_uid, left(coalesce(p_app_version, '?'), 40), p_platform,
    (select role from public.profiles where id = v_uid),
    left(p_screen, 120),
    left(regexp_replace(coalesce(nullif(trim(p_message), ''), 'Unknown error'), mask, '[phone]', 'g'), 500),
    left(regexp_replace(p_stack, mask, '[phone]', 'g'), 4000),
    coalesce(p_is_fatal, false)
  );
  -- Keep 30 days.
  delete from public.client_errors where created_at < now() - interval '30 days';
end $$;
revoke execute on function public.report_client_error(text, text, text, text, text, boolean) from public;
grant execute on function public.report_client_error(text, text, text, text, text, boolean) to anon, authenticated;
