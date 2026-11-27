-- Kitchen and bar screens: every menu item belongs to a station, and each station
-- moves its own part of an order through Incoming -> Preparing -> Ready -> Done.
-- Run once in the Supabase SQL editor (needs 0006; independent of 0007). Safe to run more than once.
-- All or nothing: if any step fails, nothing is changed.
begin;

-------------------------------------------------------------------------------
-- Station per menu item ('bar' or 'kitchen'). Set per category on More > Stations.
-------------------------------------------------------------------------------
alter table public.menu_items add column if not exists station text;

-- First guess for items that have none yet: food categories go to the kitchen.
update public.menu_items
  set station = case
    when coalesce(category, name) ~* '(breakfast|brunch|sandwich|toast|croissant|bun|egg|shakshuka|pasta|food|kitchen|meal|main|salad|savou?ry|dessert|cake|sweet|pancake|waffle|crepe|bakery|pastr|brownie|tiramisu|basboosa|kunafa|sebastian|aseeda)'
      then 'kitchen'
    else 'bar' end
  where station is null;

alter table public.menu_items alter column station set default 'bar';
alter table public.menu_items alter column station set not null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'menu_items_station_check') then
    alter table public.menu_items add constraint menu_items_station_check check (station in ('bar', 'kitchen'));
  end if;
end $$;

-------------------------------------------------------------------------------
-- Station and progress per order line
-------------------------------------------------------------------------------
alter table public.order_lines
  add column if not exists station text not null default 'bar',
  add column if not exists status public.order_status not null default 'incoming',
  add column if not exists status_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'order_lines_station_check') then
    alter table public.order_lines add constraint order_lines_station_check check (station in ('bar', 'kitchen'));
  end if;
end $$;

-- Existing lines: station from the menu, progress from their order (only once).
do $$
begin
  if not exists (select 1 from public.order_lines where status <> 'incoming' or station <> 'bar') then
    update public.order_lines l
      set station = coalesce((select m.station from public.menu_items m where m.id = l.menu_item_id), 'bar'),
          status = o.status, status_at = o.status_at
      from public.orders o
      where o.id = l.order_id;
  end if;
end $$;

create index if not exists order_lines_station_open on public.order_lines (station, status)
  where status in ('incoming', 'preparing', 'ready');

-- New lines take the station of their menu item.
create or replace function public.order_line_station()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.menu_item_id is not null then
    select coalesce(station, 'bar') into new.station from public.menu_items where id = new.menu_item_id;
  end if;
  new.station := coalesce(new.station, 'bar');
  return new;
end $$;

drop trigger if exists order_line_station on public.order_lines;
create trigger order_line_station before insert on public.order_lines
  for each row execute function public.order_line_station();

-------------------------------------------------------------------------------
-- The order's status follows its slowest station.
-------------------------------------------------------------------------------
create or replace function public.sync_order_status(p_order uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  s public.order_status;
begin
  select min(status) into s from public.order_lines where order_id = p_order;
  update public.orders
    set status = coalesce(s, status), status_at = now(),
        ready_at = case when coalesce(s, status) in ('ready', 'done') then coalesce(ready_at, now()) else ready_at end
    where id = p_order and status <> 'cancelled';
end $$;

revoke execute on function public.sync_order_status(uuid) from public, anon, authenticated;

-- One station moves its part of an order.
create or replace function public.set_station_status(p_order uuid, p_station text, p_status public.order_status)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if public.my_role() is null then raise exception 'Not allowed'; end if;
  if p_status = 'cancelled' then raise exception 'Use refund to cancel'; end if;
  if p_station not in ('bar', 'kitchen') then raise exception 'unknown_station'; end if;
  update public.order_lines
    set status = p_status, status_at = now()
    where order_id = p_order and station = p_station
      and exists (select 1 from public.orders o where o.id = p_order and o.status <> 'cancelled');
  perform public.sync_order_status(p_order);
end $$;

-- The whole order at once (kept for anything that moves an order without a station).
create or replace function public.set_order_status(p_order uuid, p_status public.order_status)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if public.my_role() is null then raise exception 'Not allowed'; end if;
  if p_status = 'cancelled' then raise exception 'Use refund to cancel'; end if;
  update public.order_lines
    set status = p_status, status_at = now()
    where order_id = p_order
      and exists (select 1 from public.orders o where o.id = p_order and o.status <> 'cancelled');
  update public.orders
    set status = p_status, status_at = now(),
        ready_at = case when p_status in ('ready', 'done') then coalesce(ready_at, now()) else ready_at end
    where id = p_order and status <> 'cancelled';
end $$;

-- What the check shows: categories and how many items each station has.
select coalesce(category, '(no category)') as category, station, count(*) as items
from public.menu_items group by 1, 2 order by 1, 2;

commit;
