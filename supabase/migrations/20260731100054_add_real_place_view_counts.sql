-- Keep a durable, truthful count of place detail opens. Historical analytics
-- seed the counter once; subsequent analytics upserts increment it atomically.
alter table public.places
  add column if not exists view_count bigint not null default 0
  check (view_count >= 0);

update public.places as place
set view_count = totals.views
from (
  select target_key::uuid as place_id, sum(events)::bigint as views
  from public.analytics_daily_events
  where event_name = 'place_open'
    and target_type = 'place'
    and target_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  group by target_key
) as totals
where place.id = totals.place_id;

create or replace function public.sync_place_view_count_from_analytics()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_delta bigint;
begin
  if new.event_name <> 'place_open'
     or new.target_type <> 'place'
     or new.target_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return new;
  end if;

  v_delta := case
    when tg_op = 'INSERT' then new.events
    else greatest(new.events - old.events, 0)
  end;

  if v_delta > 0 then
    update public.places
    set view_count = view_count + v_delta
    where id = new.target_key::uuid;
  end if;
  return new;
end;
$$;

drop trigger if exists analytics_place_view_count on public.analytics_daily_events;
create trigger analytics_place_view_count
after insert or update of events on public.analytics_daily_events
for each row execute function public.sync_place_view_count_from_analytics();

revoke all on function public.sync_place_view_count_from_analytics()
  from public, anon, authenticated;
