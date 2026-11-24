-- Cups POS, phase 1: selling at the counter and car-side, bar display, VAT receipts,
-- cash drawer, sales reports, and stock that follows invoices (in) and recipes (out).
-- Run once on top of 0001_init.sql, in the Supabase SQL editor or with `supabase db push`.
-- All or nothing: if any step fails, nothing is changed.

begin;

create extension if not exists pgcrypto with schema extensions;

-------------------------------------------------------------------------------
-- Cafe settings (one row): receipt header, TRN, printer
-------------------------------------------------------------------------------
create table public.cafe_settings (
  id boolean primary key default true check (id),
  name text not null default 'CUPS',
  name_ar text,
  trn text,                                   -- UAE VAT registration number
  address text,
  address_ar text,
  phone text,
  receipt_footer text default 'Thank you!',
  receipt_footer_ar text default 'شكراً لزيارتكم',
  invoice_prefix text not null default 'INV-',
  printer_ip text,                            -- Epson ePOS printer on the cafe Wi-Fi
  target_cost_pct numeric(5, 2) not null default 30,   -- suggested price = cost / 30%
  margin_alert_pct numeric(5, 2) not null default 35,  -- red flag above this cost share
  updated_at timestamptz not null default now()
);
insert into public.cafe_settings (id) values (true);

-------------------------------------------------------------------------------
-- Sales channels / order types, each with its own price rule and commission
-------------------------------------------------------------------------------
create table public.channels (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  name_ar text,
  price_multiplier numeric(8, 4) not null default 1 check (price_multiplier > 0),
  round_to numeric(6, 2) not null default 0,     -- round channel prices up to this step (0 = none)
  commission_pct numeric(5, 2) not null default 0,
  needs_car boolean not null default false,       -- ask for plate, colour and parking spot
  is_app boolean not null default false,          -- delivery app: paid through the app
  active boolean not null default true,
  sort integer not null default 0
);

insert into public.channels (code, name, name_ar, price_multiplier, round_to, commission_pct, needs_car, is_app, sort) values
  ('walk_in',    'Walk-in',    'داخل المقهى',  1,     0,   0,   false, false, 1),
  ('drive_thru', 'Drive-thru', 'درايف ثرو',    1,     0,   0,   true,  false, 2),
  ('car_side',   'Car-side',   'عند السيارة',  1,     0,   0,   true,  false, 3),
  ('beanz',      'Beanz',      'بينز',         1,     0,   8.5, false, true,  4),
  ('talabat',    'Talabat',    'طلبات',        1.37,  0.5, 0,   false, true,  5),
  ('falik',      'Falik',      'فاليك',        1.185, 0.5, 0,   false, true,  6);

-- Price for a channel: base x multiplier, rounded up to the channel's step.
create or replace function public.channel_price(p_base numeric, p_mult numeric, p_round numeric)
returns numeric
language sql immutable
as $$
  select case
    when p_base is null then null
    when coalesce(p_round, 0) > 0 then ceil(round(p_base * p_mult, 4) / p_round) * p_round
    else round(p_base * p_mult, 2)
  end
$$;

-------------------------------------------------------------------------------
-- Menu additions: on/off, sold out, channel price overrides, add-ons
-------------------------------------------------------------------------------
alter table public.menu_items
  add column active boolean not null default true,
  add column sold_out boolean not null default false,
  add column sort integer not null default 0;

-- A fixed price for one item on one channel, instead of the channel rule.
create table public.channel_prices (
  menu_item_id uuid not null references public.menu_items (id) on delete cascade,
  channel_id uuid not null references public.channels (id) on delete cascade,
  price numeric(10, 2) not null check (price >= 0),
  primary key (menu_item_id, channel_id)
);

create table public.modifier_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_ar text,
  min_select integer not null default 0,
  max_select integer not null default 1,      -- 1 = pick one; more = pick several
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.modifier_options (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.modifier_groups (id) on delete cascade,
  name text not null,
  name_ar text,
  price_delta numeric(10, 2) not null default 0,
  item_id uuid references public.items (id) on delete set null,   -- stock it uses
  quantity numeric(14, 4),                                         -- in the item's base unit
  no_stock boolean not null default false,                         -- uses no stock on purpose
  active boolean not null default true,
  sort integer not null default 0
);
create index on public.modifier_options (group_id);

create table public.menu_item_modifier_groups (
  menu_item_id uuid not null references public.menu_items (id) on delete cascade,
  group_id uuid not null references public.modifier_groups (id) on delete cascade,
  primary key (menu_item_id, group_id)
);

-------------------------------------------------------------------------------
-- Stock: every change is a movement; on hand = sum of movements
-------------------------------------------------------------------------------
alter table public.items
  add column min_stock numeric(14, 4),       -- warn and add to the re-order list below this
  add column track_stock boolean not null default true;

create type public.stock_kind as enum ('purchase', 'sale', 'refund', 'waste', 'count', 'adjust');

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  qty numeric(14, 4) not null,               -- base units; + in, - out
  kind public.stock_kind not null,
  order_id uuid,
  invoice_id uuid references public.invoices (id) on delete set null,
  count_id uuid,
  note text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index on public.stock_movements (item_id, created_at desc);
create index on public.stock_movements (order_id);

create or replace view public.item_stock
with (security_invoker = true) as
select i.id as item_id, coalesce(sum(m.qty), 0) as on_hand, max(m.created_at) as last_move
from public.items i
left join public.stock_movements m on m.item_id = i.id
group by i.id;

create table public.stock_counts (
  id uuid primary key default gen_random_uuid(),
  note text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.stock_count_lines (
  count_id uuid not null references public.stock_counts (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  expected numeric(14, 4) not null,
  counted numeric(14, 4) not null,
  primary key (count_id, item_id)
);

-------------------------------------------------------------------------------
-- Cash drawer sessions (one open at a time)
-------------------------------------------------------------------------------
create table public.registers (
  id uuid primary key default gen_random_uuid(),
  opened_by uuid not null references public.profiles (id),
  opened_at timestamptz not null default now(),
  opening_cash numeric(10, 2) not null default 0,
  closed_by uuid references public.profiles (id),
  closed_at timestamptz,
  expected_cash numeric(10, 2),
  counted_cash numeric(10, 2),
  notes text
);
create unique index registers_one_open on public.registers ((true)) where closed_at is null;

-------------------------------------------------------------------------------
-- Orders, lines, payments
-------------------------------------------------------------------------------
create type public.order_status as enum ('incoming', 'preparing', 'ready', 'done', 'cancelled');

create sequence public.invoice_no_seq;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  invoice_no bigint not null unique default nextval('public.invoice_no_seq'),
  ticket_no integer not null,                -- daily number called out to the customer
  business_date date not null default (now() at time zone 'Asia/Dubai')::date,
  channel_id uuid not null references public.channels (id),
  status public.order_status not null default 'incoming',
  car_plate text,
  car_color text,
  parking_spot text,
  customer_name text,
  customer_phone text,
  external_ref text,                         -- e.g. the Talabat order number
  notes text,
  total numeric(10, 2) not null,             -- incl. VAT
  vat numeric(10, 2) not null,
  cost numeric(12, 4) not null default 0,    -- recipe cost when sold
  commission numeric(10, 2) not null default 0,
  refunded numeric(10, 2) not null default 0,
  refund_reason text,
  staff_id uuid references public.profiles (id),
  register_id uuid references public.registers (id),
  created_at timestamptz not null default now(),
  status_at timestamptz not null default now(),
  ready_at timestamptz
);
create index on public.orders (business_date, created_at desc);
create index on public.orders (status) where status in ('incoming', 'preparing', 'ready');
create index on public.orders (lower(replace(car_plate, ' ', '')));

create table public.order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  menu_item_id uuid references public.menu_items (id) on delete set null,
  name text not null,
  name_ar text,
  category text,
  qty integer not null check (qty > 0),
  unit_price numeric(10, 2) not null,        -- incl. add-ons and VAT
  line_total numeric(10, 2) not null,
  unit_cost numeric(12, 4) not null default 0,
  modifiers jsonb not null default '[]',     -- [{id, name, name_ar, price}]
  note text,
  sort integer not null default 0
);
create index on public.order_lines (order_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  method text not null check (method in ('cash', 'card', 'app')),
  amount numeric(10, 2) not null,            -- negative for refunds
  register_id uuid references public.registers (id),
  created_by uuid references public.profiles (id),
  approved_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index on public.payments (order_id);
create index on public.payments (register_id);

-- Manager PINs approve refunds on a cashier's tablet. Hashed; nobody can read this table.
create table public.manager_pins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  pin_hash text not null,
  updated_at timestamptz not null default now()
);

-------------------------------------------------------------------------------
-- Functions
-------------------------------------------------------------------------------
create or replace function public.set_my_pin(p_pin text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not public.is_manager() then raise exception 'Managers only'; end if;
  if p_pin !~ '^[0-9]{4,6}$' then raise exception 'PIN must be 4 to 6 digits'; end if;
  insert into public.manager_pins (user_id, pin_hash) values (auth.uid(), crypt(p_pin, gen_salt('bf')))
  on conflict (user_id) do update set pin_hash = excluded.pin_hash, updated_at = now();
end $$;

-- Who approves: the signed-in manager, or the active manager whose PIN was typed.
create or replace function public.approver(p_pin text)
returns uuid
language plpgsql stable security definer set search_path = public, extensions
as $$
declare who uuid;
begin
  if public.is_manager() then return auth.uid(); end if;
  if coalesce(p_pin, '') = '' then return null; end if;
  select mp.user_id into who
  from public.manager_pins mp join public.profiles p on p.id = mp.user_id
  where p.active and p.role in ('owner', 'manager') and mp.pin_hash = crypt(p_pin, mp.pin_hash)
  limit 1;
  return who;
end $$;

create or replace function public.open_register(p_cash numeric)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare new_id uuid;
begin
  if public.my_role() is null then raise exception 'Not allowed'; end if;
  if exists (select 1 from public.registers where closed_at is null) then
    raise exception 'register_already_open';
  end if;
  insert into public.registers (opened_by, opening_cash) values (auth.uid(), coalesce(p_cash, 0))
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.close_register(p_counted numeric, p_notes text)
returns numeric
language plpgsql security definer set search_path = public
as $$
declare r public.registers; expected numeric;
begin
  if public.my_role() is null then raise exception 'Not allowed'; end if;
  select * into r from public.registers where closed_at is null for update;
  if r.id is null then raise exception 'no_open_register'; end if;
  select r.opening_cash + coalesce(sum(amount), 0) into expected
  from public.payments where register_id = r.id and method = 'cash';
  update public.registers
    set closed_by = auth.uid(), closed_at = now(), expected_cash = expected,
        counted_cash = p_counted, notes = nullif(trim(p_notes), '')
    where id = r.id;
  return p_counted - expected;
end $$;

/*
  Place and pay an order. Prices, VAT and costs are worked out here from the menu,
  never trusted from the tablet. p looks like:
  { channel_id, lines: [{menu_item_id, qty, options: [option ids], note}],
    payments: [{method, amount}], car_plate, car_color, parking_spot,
    customer_name, customer_phone, external_ref, notes }
*/
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
    insert into public.stock_movements (item_id, qty, kind, order_id, created_by)
    select r.item_id, -(r.quantity * (1 + r.waste_pct / 100) / nullif(m.yield_portions, 0) * v_qty),
           'sale', oid, auth.uid()
    from public.recipe_lines r join public.items i on i.id = r.item_id
    where r.menu_item_id = m.id and i.track_stock;

    insert into public.stock_movements (item_id, qty, kind, order_id, created_by)
    select o.item_id, -(o.quantity * v_qty), 'sale', oid, auth.uid()
    from jsonb_array_elements(mods) x
    join public.modifier_options o on o.id = (x ->> 'id')::uuid
    join public.items i on i.id = o.item_id
    where o.item_id is not null and coalesce(o.quantity, 0) > 0 and not o.no_stock and i.track_stock;
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

create or replace function public.set_order_status(p_order uuid, p_status public.order_status)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if public.my_role() is null then raise exception 'Not allowed'; end if;
  if p_status = 'cancelled' then raise exception 'Use refund to cancel'; end if;
  update public.orders
    set status = p_status, status_at = now(),
        ready_at = case when p_status = 'ready' then coalesce(ready_at, now()) else ready_at end
    where id = p_order and status <> 'cancelled';
end $$;

-- Full refund, approved by a manager (signed in, or by PIN on the cashier's tablet).
create or replace function public.refund_order(p_order uuid, p_pin text, p_reason text, p_restock boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare o public.orders; who uuid; reg uuid;
begin
  if public.my_role() is null then raise exception 'Not allowed'; end if;
  who := public.approver(p_pin);
  if who is null then raise exception 'manager_pin_required'; end if;
  select * into o from public.orders where id = p_order for update;
  if o.id is null or o.status = 'cancelled' then raise exception 'already_refunded'; end if;
  select id into reg from public.registers where closed_at is null;

  insert into public.payments (order_id, method, amount, register_id, created_by, approved_by)
  select p_order, method, -sum(amount), reg, auth.uid(), who
  from public.payments where order_id = p_order group by method having sum(amount) > 0;

  if p_restock then
    insert into public.stock_movements (item_id, qty, kind, order_id, created_by, note)
    select item_id, -sum(qty), 'refund', p_order, auth.uid(), 'refund'
    from public.stock_movements where order_id = p_order and kind = 'sale' group by item_id;
  end if;

  update public.orders
    set status = 'cancelled', status_at = now(), refunded = o.total,
        refund_reason = nullif(trim(p_reason), '')
    where id = p_order;
end $$;

-- "Your usual?": the last 3 orders for a car plate (any date, so staff can see regulars).
create or replace function public.plate_history(p_plate text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(x order by x.created_at desc), '[]') from (
    select o.id, o.created_at, o.customer_name, o.car_color,
      (select jsonb_agg(jsonb_build_object('menu_item_id', l.menu_item_id, 'name', l.name, 'name_ar', l.name_ar,
                                           'qty', l.qty, 'modifiers', l.modifiers) order by l.sort)
         from public.order_lines l where l.order_id = o.id) as lines
    from public.orders o
    where public.my_role() is not null
      and o.car_plate = upper(trim(p_plate)) and o.status <> 'cancelled'
    order by o.created_at desc
    limit 3) x
$$;

-- Record spoiled or lost stock (positive quantity = amount thrown away).
create or replace function public.record_waste(p_item uuid, p_qty numeric, p_note text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_manager() then raise exception 'Managers only'; end if;
  if coalesce(p_qty, 0) <= 0 then raise exception 'bad_quantity'; end if;
  insert into public.stock_movements (item_id, qty, kind, note, created_by)
  values (p_item, -p_qty, 'waste', nullif(trim(p_note), ''), auth.uid());
end $$;

-- Stock count: p_lines = [{item_id, counted}]. The difference is booked as a count correction.
create or replace function public.submit_count(p_lines jsonb, p_note text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare cid uuid;
begin
  if not public.is_manager() then raise exception 'Managers only'; end if;
  insert into public.stock_counts (note, created_by) values (nullif(trim(p_note), ''), auth.uid())
  returning id into cid;
  insert into public.stock_count_lines (count_id, item_id, expected, counted)
  select cid, (x ->> 'item_id')::uuid, coalesce(s.on_hand, 0), (x ->> 'counted')::numeric
  from jsonb_array_elements(p_lines) x
  left join public.item_stock s on s.item_id = (x ->> 'item_id')::uuid
  where nullif(x ->> 'counted', '') is not null;
  insert into public.stock_movements (item_id, qty, kind, count_id, created_by, note)
  select item_id, counted - expected, 'count', cid, auth.uid(), 'count'
  from public.stock_count_lines where count_id = cid and counted <> expected;
  return cid;
end $$;

-- Sales report for a date range (Dubai business days), for the Reports page and Excel export.
create or replace function public.sales_report(p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare res jsonb;
begin
  if not public.is_manager() then raise exception 'Managers only'; end if;
  with o as (
    select * from public.orders where business_date between p_from and p_to and status <> 'cancelled'
  ), l as (
    select ol.* from public.order_lines ol join o on o.id = ol.order_id
  )
  select jsonb_build_object(
    'totals', (select jsonb_build_object(
        'orders', count(*), 'sales', coalesce(sum(total), 0), 'vat', coalesce(sum(vat), 0),
        'cost', coalesce(sum(cost), 0), 'commission', coalesce(sum(commission), 0)) from o),
    'refunds', (select jsonb_build_object('orders', count(*), 'amount', coalesce(sum(refunded), 0))
        from public.orders where business_date between p_from and p_to and status = 'cancelled'),
    'by_channel', (select coalesce(jsonb_agg(x order by x.sales desc), '[]') from (
        select c.code, c.name, c.name_ar, count(*) as orders, sum(o.total) as sales, sum(o.vat) as vat,
               sum(o.cost) as cost, sum(o.commission) as commission
        from o join public.channels c on c.id = o.channel_id group by c.id) x),
    'by_item', (select coalesce(jsonb_agg(x order by x.sales desc), '[]') from (
        select coalesce(menu_item_id::text, name) as id, min(name) as name, min(name_ar) as name_ar,
               min(category) as category, sum(qty) as qty, sum(line_total) as sales, sum(unit_cost * qty) as cost
        from l group by coalesce(menu_item_id::text, name)) x),
    'by_hour', (select coalesce(jsonb_agg(x order by x.hour), '[]') from (
        select extract(hour from created_at at time zone 'Asia/Dubai')::int as hour,
               count(*) as orders, sum(total) as sales
        from o group by 1) x),
    'by_day', (select coalesce(jsonb_agg(x order by x.day), '[]') from (
        select business_date as day, count(*) as orders, sum(total) as sales, sum(cost) as cost
        from o group by 1) x),
    'by_staff', (select coalesce(jsonb_agg(x order by x.sales desc), '[]') from (
        select o.staff_id, coalesce(p.full_name, '?') as name, count(*) as orders, sum(o.total) as sales
        from o left join public.profiles p on p.id = o.staff_id group by o.staff_id, p.full_name) x),
    'by_method', (select coalesce(jsonb_agg(x), '[]') from (
        select method, sum(amount) as amount from public.payments py
        join public.orders oo on oo.id = py.order_id
        where oo.business_date between p_from and p_to group by method) x)
  ) into res;
  return res;
end $$;

-- Confirmed invoices now also add stock (quantity x pack size, in base units).
create or replace function public.confirm_invoice(p_invoice uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  inv public.invoices;
  l record;
  new_cost numeric;
  old_cost numeric;
  pct numeric;
  alerts integer := 0;
begin
  if not public.is_manager() then raise exception 'Managers only'; end if;
  select * into inv from public.invoices where id = p_invoice for update;
  if inv.status <> 'review' then raise exception 'Invoice is not waiting for review'; end if;

  for l in
    select il.*, i.unit_cost as current_cost, i.name as item_name
    from public.invoice_lines il join public.items i on i.id = il.item_id
    where il.invoice_id = p_invoice and not il.skip
      and il.unit_price is not null and coalesce(il.pack_size, 0) > 0
    order by il.line_no
  loop
    new_cost := round(l.unit_price / l.pack_size, 6);
    old_cost := l.current_cost;

    insert into public.price_history
      (item_id, supplier_id, invoice_id, unit_cost, invoice_unit_price, invoice_unit, recorded_on)
    values (l.item_id, inv.supplier_id, p_invoice, new_cost, l.unit_price, l.unit,
            coalesce(inv.invoice_date, current_date));

    if old_cost is not null and old_cost > 0 and abs(new_cost - old_cost) / old_cost >= 0.005 then
      pct := round((new_cost - old_cost) / old_cost * 100, 2);
      insert into public.price_alerts (item_id, invoice_id, supplier_id, old_cost, new_cost, change_pct)
      values (l.item_id, p_invoice, inv.supplier_id, old_cost, new_cost, pct);
      perform public.notify_managers('price', 'price_changed',
        l.item_name || ' ' || case when pct > 0 then '+' else '' end || pct || '%',
        '/items/' || l.item_id);
      alerts := alerts + 1;
    end if;

    update public.items
      set unit_cost = new_cost,
          unit_cost_at = coalesce(inv.invoice_date, current_date),
          last_supplier_id = inv.supplier_id
      where id = l.item_id
        and (unit_cost_at is null or unit_cost_at <= coalesce(inv.invoice_date, current_date));

    if coalesce(l.quantity, 0) > 0 then
      insert into public.stock_movements (item_id, qty, kind, invoice_id, created_by, note)
      values (l.item_id, l.quantity * l.pack_size, 'purchase', p_invoice, auth.uid(), inv.supplier_name);
    end if;

    insert into public.item_aliases (item_id, supplier_id, raw_name, pack_size)
    values (l.item_id, inv.supplier_id, l.raw_name, l.pack_size)
    on conflict (coalesce(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(raw_name))
    do update set item_id = excluded.item_id, pack_size = excluded.pack_size;
  end loop;

  update public.invoices
    set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now()
    where id = p_invoice;
  return alerts;
end $$;

-------------------------------------------------------------------------------
-- Row level security
-------------------------------------------------------------------------------
alter table public.cafe_settings enable row level security;
alter table public.channels enable row level security;
alter table public.channel_prices enable row level security;
alter table public.modifier_groups enable row level security;
alter table public.modifier_options enable row level security;
alter table public.menu_item_modifier_groups enable row level security;
alter table public.stock_movements enable row level security;
alter table public.stock_counts enable row level security;
alter table public.stock_count_lines enable row level security;
alter table public.registers enable row level security;
alter table public.orders enable row level security;
alter table public.order_lines enable row level security;
alter table public.payments enable row level security;
alter table public.manager_pins enable row level security;   -- no policies: functions only

-- Everyone signed in needs the menu, channels and add-ons to sell.
create policy "menu visible" on public.menu_items for select to authenticated using (true);
create policy "settings visible" on public.cafe_settings for select to authenticated using (true);
create policy "mgr settings" on public.cafe_settings for update to authenticated
  using (public.is_manager()) with check (public.is_manager());
create policy "channels visible" on public.channels for select to authenticated using (true);
create policy "mgr channels" on public.channels for all to authenticated
  using (public.is_manager()) with check (public.is_manager());
create policy "channel prices visible" on public.channel_prices for select to authenticated using (true);
create policy "mgr channel prices" on public.channel_prices for all to authenticated
  using (public.is_manager()) with check (public.is_manager());
create policy "modifier groups visible" on public.modifier_groups for select to authenticated using (true);
create policy "mgr modifier groups" on public.modifier_groups for all to authenticated
  using (public.is_manager()) with check (public.is_manager());
create policy "modifier options visible" on public.modifier_options for select to authenticated using (true);
create policy "mgr modifier options" on public.modifier_options for all to authenticated
  using (public.is_manager()) with check (public.is_manager());
create policy "item modifiers visible" on public.menu_item_modifier_groups for select to authenticated using (true);
create policy "mgr item modifiers" on public.menu_item_modifier_groups for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

create policy "mgr stock" on public.stock_movements for select to authenticated using (public.is_manager());
create policy "mgr counts" on public.stock_counts for select to authenticated using (public.is_manager());
create policy "mgr count lines" on public.stock_count_lines for select to authenticated using (public.is_manager());

-- Staff see today's and yesterday's orders (till, bar display); managers see all.
create policy "registers visible" on public.registers for select to authenticated using (true);
create policy "orders visible" on public.orders for select to authenticated
  using (public.is_manager() or (public.my_role() is not null and business_date >= current_date - 1));
create policy "order lines visible" on public.order_lines for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy "payments visible" on public.payments for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));

revoke execute on function public.approver(text) from public, anon, authenticated;

-- Live updates for the bar display.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;

commit;
