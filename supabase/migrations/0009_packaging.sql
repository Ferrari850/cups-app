-- Packaging cost: cups, lids, sleeves, boxes, bags, straws, napkins...
-- A menu item's direct cost now has two parts:
--   * ingredient cost: the recipe, divided by how many portions it makes (as before)
--   * packaging cost: what one portion goes out in, per portion (not divided by the yield)
-- Cost per portion = ingredients + packaging. That total is what the till saves on each sale,
-- so it flows into Finance (cost of goods sold), with the packaging part shown on its own line.
--
-- Packaging is bought on invoices like any ingredient: it is a row in items with
-- is_packaging = true. Existing items are tagged by name below; new ones are tagged as they
-- are created (from an invoice or by hand). Anything tagged wrongly can be switched on the
-- ingredient's page.
--
-- Run once on top of 0007 and 0008, in the Supabase SQL editor. Safe to run more than once.
-- All or nothing: if any step fails, nothing is changed.
begin;

alter table public.items
  add column if not exists is_packaging boolean not null default false;

-- A packaging line on a menu item: quantity is per portion.
alter table public.recipe_lines
  add column if not exists packaging boolean not null default false;

-- What one sold unit's packaging cost, saved with the sale (unit_cost already includes it).
alter table public.order_lines
  add column if not exists packaging_cost numeric(14, 4) not null default 0;

-------------------------------------------------------------------------------
-- Is this name packaging? English and Arabic. Tea bags, drip bags and ice bags are not.
-------------------------------------------------------------------------------
create or replace function public.looks_like_packaging(p_name text, p_name_ar text)
returns boolean
language sql immutable
as $$
  select
    -- Words that are always packaging.
    coalesce(p_name, '') ~* (
      '\m(cups?|lids?|sleeves?|straws?|napkins?|serviettes?|tissues?|containers?|carriers?|'
      || 'cup ?holders?|stirrers?|cutlery|take ?away|take-away|disposable|packaging|foil|'
      || 'cling ?(film|wrap)|food wrap|wrapping paper|stickers?|labels?|butter paper|greaseproof|'
      || '(paper|plastic|kraft|disposable|wooden) (bowls?|plates?|spoons?|forks?|knives|knife|stirrers?))\M')
    -- Bags and boxes, unless it is food sold in a bag or box (tea bags, a box of eggs...).
    or (coalesce(p_name, '') ~* '\m(bags?|box(es)?|pouch(es)?)\M'
        and coalesce(p_name, '') !~* '\m(tea|drip|ice|coffee|beans?|sugar|eggs?|rice|flour|salt|fruits?|dates|vegetables?|berry|berries|strawberry|strawberries|blueberry|blueberries|mushrooms?|tomato(es)?|lettuce|herbs?|mint)\M')
    -- Arabic names.
    or coalesce(p_name_ar, '') ~ 'أكواب|اكواب|أغطية|اغطية|شفاط|مصاص|مناديل|تغليف'
$$;

-- New items: tag packaging by name, unless the person creating it already said what it is.
create or replace function public.items_tag_packaging()
returns trigger
language plpgsql
as $$
begin
  if not new.is_packaging and not coalesce(new.is_prep, false)
     and public.looks_like_packaging(new.name, new.name_ar) then
    new.is_packaging := true;
  end if;
  return new;
end $$;

drop trigger if exists items_packaging on public.items;
create trigger items_packaging before insert on public.items
  for each row execute function public.items_tag_packaging();

-- Existing items (from the invoices already uploaded).
update public.items
  set is_packaging = true
  where not is_packaging and not is_prep and public.looks_like_packaging(name, name_ar);

-------------------------------------------------------------------------------
-- Menu cost = ingredients (per portion) + packaging (per portion).
-- Same columns as before, then the split at the end.
-------------------------------------------------------------------------------
create or replace view public.menu_item_costs
with (security_invoker = true) as
select
  m.id as menu_item_id,
  round(
    coalesce(sum(r.quantity * (1 + r.waste_pct / 100) * i.unit_cost) filter (where not r.packaging), 0)
      / nullif(m.yield_portions, 0)
    + coalesce(sum(r.quantity * (1 + r.waste_pct / 100) * i.unit_cost) filter (where r.packaging), 0),
    4) as portion_cost,
  count(r.id) filter (where i.unit_cost is null or i.prep_missing > 0) as missing_prices,
  count(r.id) filter (where not r.packaging) as ingredient_count,
  round(coalesce(sum(r.quantity * (1 + r.waste_pct / 100) * i.unit_cost) filter (where not r.packaging), 0)
      / nullif(m.yield_portions, 0), 4) as ingredient_cost,
  round(coalesce(sum(r.quantity * (1 + r.waste_pct / 100) * i.unit_cost) filter (where r.packaging), 0), 4)
    as packaging_cost,
  count(r.id) filter (where r.packaging) as packaging_count
from public.menu_items m
left join public.recipe_lines r on r.menu_item_id = m.id
left join public.items i on i.id = r.item_id
group by m.id, m.yield_portions;

-------------------------------------------------------------------------------
-- POS: same as 0007, except packaging lines are per portion (not divided by the yield) and
-- each sale line keeps its packaging cost.
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

    select mi.*, coalesce(c.portion_cost, 0) as portion_cost, coalesce(c.packaging_cost, 0) as pack_cost,
           cp.price as fixed_price
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
                                    line_total, unit_cost, packaging_cost, modifiers, note, sort)
    values (oid, m.id, m.name, m.name_ar, m.category, v_qty, v_price, v_price * v_qty,
            v_cost, m.pack_cost, mods, nullif(trim(ln ->> 'note'), ''), n);
    v_total := v_total + v_price * v_qty;
    cost_total := cost_total + v_cost * v_qty;

    -- Stock out: the recipe (scaled to one portion, with waste), its packaging (already per
    -- portion) and each add-on's stock. Homemade items that are not stock-tracked come out as
    -- their ingredients.
    insert into public.stock_movements (item_id, qty, kind, order_id, created_by)
    select s.item_id, -sum(s.qty), 'sale', oid, auth.uid()
    from public.recipe_lines r
    cross join lateral public.stock_usage(
      r.item_id,
      r.quantity * (1 + r.waste_pct / 100)
        / (case when r.packaging then 1 else nullif(m.yield_portions, 0) end) * v_qty) s
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

-------------------------------------------------------------------------------
-- Finance: the packaging part of cost of goods sold (the 0006 report itself is unchanged).
-------------------------------------------------------------------------------
create or replace function public.finance_report_packaging(p_from date, p_to date)
returns numeric
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_manager() then raise exception 'Managers only'; end if;
  return (select coalesce(sum(l.packaging_cost * l.qty), 0)
          from public.order_lines l
          join public.orders o on o.id = l.order_id
          where o.business_date between p_from and p_to and o.status <> 'cancelled');
end $$;

revoke execute on function public.finance_report_packaging(date, date) from public, anon;
grant execute on function public.finance_report_packaging(date, date) to authenticated;

commit;

-- What was tagged as packaging (check this list; untick any that are wrong on the ingredient's page).
select i.name, i.name_ar, i.base_unit, i.unit_cost,
       (select count(*) from public.invoice_lines l where l.item_id = i.id) as invoice_lines
from public.items i
where i.is_packaging
order by i.name;
