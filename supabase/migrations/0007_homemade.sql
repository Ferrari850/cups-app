-- Homemade items (prep / sub-recipes): granola, pink sauce, syrups...
-- A homemade item is an ingredient (a row in items) with its own batch recipe and a batch yield.
-- Its cost per g / ml / piece is worked out from that recipe and updates by itself whenever an
-- ingredient's price changes (from an invoice or by hand). It can go into menu recipes, into
-- other homemade items, onto add-ons, and be sold on its own through a menu item.
--
-- Stock, per homemade item, one of two ways:
--   * track_stock = false (default): selling deducts its ingredients directly. No extra work.
--   * track_stock = true: staff log each batch made ("Made a batch"). That adds the homemade
--     item to stock and takes its ingredients out; selling then deducts the homemade item.
--
-- Run once on top of 0006, in the Supabase SQL editor. Safe to run more than once.
-- All or nothing: if any step fails, nothing is changed.
begin;

alter type public.stock_kind add value if not exists 'production';

alter table public.items
  add column if not exists is_prep boolean not null default false,
  add column if not exists batch_yield numeric(14, 4),          -- base units one batch makes
  add column if not exists prep_missing integer not null default 0; -- ingredients without a price

create table if not exists public.prep_lines (
  id uuid primary key default gen_random_uuid(),
  prep_id uuid not null references public.items (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete restrict,
  quantity numeric(14, 4) not null check (quantity > 0),  -- in the ingredient's base unit, per batch
  waste_pct numeric(5, 2) not null default 0,
  sort integer not null default 0,
  check (prep_id <> item_id)
);
create index if not exists prep_lines_prep_idx on public.prep_lines (prep_id);
create index if not exists prep_lines_item_idx on public.prep_lines (item_id);

alter table public.prep_lines enable row level security;
drop policy if exists "mgr prep lines" on public.prep_lines;
create policy "mgr prep lines" on public.prep_lines for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-------------------------------------------------------------------------------
-- No loops: granola cannot (even indirectly) contain granola.
-------------------------------------------------------------------------------
create or replace function public.prep_no_cycle()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if exists (
    with recursive d(id) as (
      select new.item_id
      union
      select l.item_id from public.prep_lines l join d on l.prep_id = d.id
    )
    select 1 from d where id = new.prep_id
  ) then
    raise exception 'prep_cycle';
  end if;
  return new;
end $$;

drop trigger if exists prep_lines_no_cycle on public.prep_lines;
create trigger prep_lines_no_cycle before insert or update of prep_id, item_id on public.prep_lines
  for each row execute function public.prep_no_cycle();

-------------------------------------------------------------------------------
-- Cost of a homemade item = recipe cost / batch yield. Kept up to date by triggers.
-------------------------------------------------------------------------------
create or replace function public.refresh_prep_cost(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare it public.items; v_cost numeric; v_missing integer; v_lines integer;
begin
  select * into it from public.items where id = p_id;
  if it.id is null or not it.is_prep then return; end if;
  select coalesce(sum(l.quantity * (1 + l.waste_pct / 100) * i.unit_cost), 0),
         count(*) filter (where i.unit_cost is null or i.prep_missing > 0),
         count(*)
    into v_cost, v_missing, v_lines
    from public.prep_lines l join public.items i on i.id = l.item_id
    where l.prep_id = p_id;
  v_cost := case when v_lines = 0 or coalesce(it.batch_yield, 0) <= 0 then null
                 else round(v_cost / it.batch_yield, 6) end;
  update public.items
    set unit_cost = v_cost, unit_cost_at = now(), prep_missing = v_missing
    where id = p_id
      and (unit_cost is distinct from v_cost or prep_missing is distinct from v_missing);
end $$;

-- Recipe of a homemade item changed.
create or replace function public.prep_lines_changed()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then perform public.refresh_prep_cost(old.prep_id); end if;
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.prep_id <> old.prep_id) then
    perform public.refresh_prep_cost(new.prep_id);
  end if;
  return null;
end $$;

drop trigger if exists prep_lines_cost on public.prep_lines;
create trigger prep_lines_cost after insert or update or delete on public.prep_lines
  for each row execute function public.prep_lines_changed();

-- An ingredient's price changed (invoice, by hand, or another homemade item): refresh every
-- homemade item that uses it. A homemade item's own yield or switch changed: refresh it.
create or replace function public.items_cost_changed()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare p uuid;
begin
  if new.is_prep and (new.batch_yield is distinct from old.batch_yield or not old.is_prep) then
    perform public.refresh_prep_cost(new.id);
    return null; -- that update fires this trigger again for the parents
  end if;
  if new.unit_cost is distinct from old.unit_cost or new.prep_missing is distinct from old.prep_missing then
    for p in select distinct prep_id from public.prep_lines where item_id = new.id loop
      perform public.refresh_prep_cost(p);
    end loop;
  end if;
  return null;
end $$;

drop trigger if exists items_prep_cost on public.items;
create trigger items_prep_cost after update of unit_cost, prep_missing, batch_yield, is_prep on public.items
  for each row execute function public.items_cost_changed();

-- Menu cost: an ingredient also counts as "missing a price" when it is a homemade item with
-- an unpriced ingredient inside.
create or replace view public.menu_item_costs
with (security_invoker = true) as
select
  m.id as menu_item_id,
  round(coalesce(sum(r.quantity * (1 + r.waste_pct / 100) * i.unit_cost), 0) / nullif(m.yield_portions, 0), 4)
    as portion_cost,
  count(r.id) filter (where i.unit_cost is null or i.prep_missing > 0) as missing_prices,
  count(r.id) as ingredient_count
from public.menu_items m
left join public.recipe_lines r on r.menu_item_id = m.id
left join public.items i on i.id = r.item_id
group by m.id, m.yield_portions;

-------------------------------------------------------------------------------
-- What leaves stock when p_qty (base units) of an item is used. A homemade item that is not
-- stock-tracked is broken down into its ingredients (through any number of levels).
-------------------------------------------------------------------------------
create or replace function public.stock_usage(p_item uuid, p_qty numeric)
returns table (item_id uuid, qty numeric)
language sql stable security definer set search_path = public
as $$
  with recursive u(item_id, qty, depth) as (
    select p_item, p_qty, 0
    union all
    select l.item_id, u.qty * l.quantity * (1 + l.waste_pct / 100) / i.batch_yield, u.depth + 1
    from u
    join public.items i on i.id = u.item_id
    join public.prep_lines l on l.prep_id = i.id
    where i.is_prep and not i.track_stock and coalesce(i.batch_yield, 0) > 0 and u.depth < 10
  )
  select u.item_id, sum(u.qty)
  from u join public.items i on i.id = u.item_id
  where i.track_stock
  group by u.item_id
$$;

-- "Made a batch": adds the homemade item to stock and takes its ingredients out.
create or replace function public.make_batch(p_item uuid, p_batches numeric, p_note text)
returns void
language plpgsql security definer set search_path = public
as $$
declare it public.items; l record; made numeric;
begin
  if not public.is_manager() then raise exception 'Managers only'; end if;
  select * into it from public.items where id = p_item;
  if it.id is null or not it.is_prep then raise exception 'not_homemade'; end if;
  if not it.track_stock then raise exception 'not_tracked'; end if;
  if coalesce(it.batch_yield, 0) <= 0 then raise exception 'no_yield'; end if;
  if coalesce(p_batches, 0) <= 0 or p_batches > 100 then raise exception 'bad_quantity'; end if;
  made := it.batch_yield * p_batches;

  insert into public.stock_movements (item_id, qty, kind, note, created_by)
  values (p_item, made, 'production', nullif(trim(p_note), ''), auth.uid());

  for l in select * from public.prep_lines where prep_id = p_item loop
    insert into public.stock_movements (item_id, qty, kind, note, created_by)
    select s.item_id, -s.qty, 'production', it.name, auth.uid()
    from public.stock_usage(l.item_id, l.quantity * (1 + l.waste_pct / 100) * p_batches) s;
  end loop;
end $$;

-------------------------------------------------------------------------------
-- POS: same as 0002, except stock out goes through stock_usage() (recipe lines and add-ons).
-------------------------------------------------------------------------------
create or replace function public.place_order(p jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  ch public.channels;
  reg uuid;
  bdate date := (now() at time zone 'Asia/Dubai')::date;
  oid uuid;
  ticket integer;
  inv bigint;
  ln jsonb;
  m record;
  opt record;
  base numeric;
  v_price numeric;
  v_cost numeric;
  mods jsonb;
  v_qty integer;
  v_total numeric := 0;
  cost_total numeric := 0;
  paid numeric := 0;
  pay jsonb;
  n integer := 0;
  max_sel integer;
begin
  if public.my_role() is null then raise exception 'Not allowed'; end if;
  select * into ch from public.channels where id = (p ->> 'channel_id')::uuid and active;
  if ch.id is null then raise exception 'unknown_channel'; end if;
  if jsonb_array_length(coalesce(p -> 'lines', '[]')) = 0 then raise exception 'empty_order'; end if;

  select id into reg from public.registers where closed_at is null;

  perform pg_advisory_xact_lock(hashtext('cups_ticket_' || bdate));
  select coalesce(max(ticket_no), 0) + 1 into ticket from public.orders where business_date = bdate;

  insert into public.orders (ticket_no, business_date, channel_id, car_plate, car_color, parking_spot,
                             customer_name, customer_phone, external_ref, notes, total, vat,
                             staff_id, register_id)
  values (ticket, bdate, ch.id,
          nullif(upper(trim(p ->> 'car_plate')), ''), nullif(trim(p ->> 'car_color'), ''),
          nullif(trim(p ->> 'parking_spot'), ''), nullif(trim(p ->> 'customer_name'), ''),
          nullif(trim(p ->> 'customer_phone'), ''), nullif(trim(p ->> 'external_ref'), ''),
          nullif(trim(p ->> 'notes'), ''), 0, 0, auth.uid(), reg)
  returning id, invoice_no into oid, inv;

  for ln in select * from jsonb_array_elements(p -> 'lines') loop
    n := n + 1;
    v_qty := coalesce((ln ->> 'qty')::integer, 1);
    if v_qty < 1 or v_qty > 99 then raise exception 'bad_quantity'; end if;

    select mi.*, coalesce(c.portion_cost, 0) as portion_cost, cp.price as fixed_price
      into m
      from public.menu_items mi
      left join public.menu_item_costs c on c.menu_item_id = mi.id
      left join public.channel_prices cp on cp.menu_item_id = mi.id and cp.channel_id = ch.id
      where mi.id = (ln ->> 'menu_item_id')::uuid;
    if m.id is null or not m.active then raise exception 'item_not_available'; end if;
    if m.sold_out then raise exception 'sold_out: %', m.name; end if;
    base := coalesce(m.fixed_price, public.channel_price(m.selling_price, ch.price_multiplier, ch.round_to));
    if base is null then raise exception 'no_price: %', m.name; end if;

    v_price := base;
    v_cost := m.portion_cost;
    mods := '[]';
    for opt in
      select o.*, g.max_select, i.unit_cost as item_cost
      from public.modifier_options o
      join public.modifier_groups g on g.id = o.group_id
      join public.menu_item_modifier_groups mg on mg.group_id = g.id and mg.menu_item_id = m.id
      left join public.items i on i.id = o.item_id
      where o.active and o.id in (select (x #>> '{}')::uuid from jsonb_array_elements(coalesce(ln -> 'options', '[]')) x)
      order by g.sort, o.sort
    loop
      v_price := v_price + coalesce(public.channel_price(opt.price_delta, ch.price_multiplier, ch.round_to), 0);
      v_cost := v_cost + coalesce(opt.quantity * opt.item_cost, 0);
      mods := mods || jsonb_build_object('id', opt.id, 'name', opt.name, 'name_ar', opt.name_ar,
        'price', public.channel_price(opt.price_delta, ch.price_multiplier, ch.round_to));
    end loop;
    if jsonb_array_length(mods) <> jsonb_array_length(coalesce(ln -> 'options', '[]')) then
      raise exception 'bad_options';
    end if;
    -- No more picks in a group than it allows.
    select max(c) into max_sel from (
      select count(*) - max(g.max_select) as c
      from jsonb_array_elements(mods) x
      join public.modifier_options o on o.id = (x ->> 'id')::uuid
      join public.modifier_groups g on g.id = o.group_id
      group by g.id) s;
    if coalesce(max_sel, 0) > 0 then raise exception 'too_many_options'; end if;

    insert into public.order_lines (order_id, menu_item_id, name, name_ar, category, qty, unit_price,
                                    line_total, unit_cost, modifiers, note, sort)
    values (oid, m.id, m.name, m.name_ar, m.category, v_qty, v_price, v_price * v_qty,
            v_cost, mods, nullif(trim(ln ->> 'note'), ''), n);
    v_total := v_total + v_price * v_qty;
    cost_total := cost_total + v_cost * v_qty;

    -- Stock out: the recipe (scaled to one portion, with waste) and each add-on's stock.
    -- Homemade items that are not stock-tracked come out as their ingredients.
    insert into public.stock_movements (item_id, qty, kind, order_id, created_by)
    select s.item_id, -sum(s.qty), 'sale', oid, auth.uid()
    from public.recipe_lines r
    cross join lateral public.stock_usage(
      r.item_id, r.quantity * (1 + r.waste_pct / 100) / nullif(m.yield_portions, 0) * v_qty) s
    where r.menu_item_id = m.id
    group by s.item_id;

    insert into public.stock_movements (item_id, qty, kind, order_id, created_by)
    select s.item_id, -sum(s.qty), 'sale', oid, auth.uid()
    from jsonb_array_elements(mods) x
    join public.modifier_options o on o.id = (x ->> 'id')::uuid
    cross join lateral public.stock_usage(o.item_id, o.quantity * v_qty) s
    where o.item_id is not null and coalesce(o.quantity, 0) > 0 and not o.no_stock
    group by s.item_id;
  end loop;

  -- Payments must cover the order exactly (the tablet works out change for cash).
  for pay in select * from jsonb_array_elements(coalesce(p -> 'payments', '[]')) loop
    if (pay ->> 'method') not in ('cash', 'card', 'app') or (pay ->> 'amount')::numeric <= 0 then
      raise exception 'bad_payment';
    end if;
    insert into public.payments (order_id, method, amount, register_id, created_by)
    values (oid, pay ->> 'method', round((pay ->> 'amount')::numeric, 2), reg, auth.uid());
    paid := paid + round((pay ->> 'amount')::numeric, 2);
  end loop;
  if paid <> v_total then raise exception 'payment_mismatch: paid % of %', paid, v_total; end if;

  update public.orders
    set total = v_total, vat = round(v_total - v_total / 1.05, 2), cost = cost_total,
        commission = round(v_total * ch.commission_pct / 100, 2)
    where id = oid;

  return jsonb_build_object('id', oid, 'ticket_no', ticket, 'invoice_no', inv, 'total', v_total);
end $$;

commit;
