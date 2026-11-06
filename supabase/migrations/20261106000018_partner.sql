-- LocalLoop · 0018 · delivery partner tools (Phase 4)

-- Home-screen figures for a delivery partner. "Today" is the Asia/Kolkata day.
-- cash_in_hand: Cash-on-Delivery money collected today that the partner owes
-- the platform/shop (settlement flow arrives with payouts).
create or replace function public.partner_dashboard()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := public._require_role('delivery_partner');
  v_today timestamptz := date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
  v_week timestamptz := v_today - interval '6 days';
begin
  if not exists (select 1 from public.delivery_partners where id = v_uid) then
    raise exception 'partner_not_registered' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'deliveries_today', (select count(*) from public.delivery_assignments
                          where partner_id = v_uid and status = 'delivered' and delivered_at >= v_today),
    'earnings_today', (select coalesce(sum(earning), 0) from public.delivery_assignments
                        where partner_id = v_uid and status = 'delivered' and delivered_at >= v_today),
    'deliveries_7d', (select count(*) from public.delivery_assignments
                       where partner_id = v_uid and status = 'delivered' and delivered_at >= v_week),
    'earnings_7d', (select coalesce(sum(earning), 0) from public.delivery_assignments
                     where partner_id = v_uid and status = 'delivered' and delivered_at >= v_week),
    'cash_in_hand', (select coalesce(sum(p.amount), 0) from public.payments p
                      where p.collected_by = v_uid and p.method = 'cod' and p.status = 'paid' and p.paid_at >= v_today),
    'rating_avg', (select rating_avg from public.delivery_partners where id = v_uid),
    'rating_count', (select rating_count from public.delivery_partners where id = v_uid),
    'active_assignment_id', (select id from public.delivery_assignments
                              where partner_id = v_uid and status in ('accepted', 'picked_up')
                              order by responded_at desc nulls last limit 1)
  );
end $$;

grant execute on function public.partner_dashboard() to authenticated;
