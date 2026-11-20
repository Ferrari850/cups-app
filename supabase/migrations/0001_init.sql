-- Cups cafe management: initial schema
-- Run in Supabase SQL editor or with `supabase db push`.


-------------------------------------------------------------------------------
-- People and roles
-------------------------------------------------------------------------------
create type public.app_role as enum ('owner', 'manager', 'staff');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  phone text,
  role public.app_role not null default 'staff',
  position text,                       -- e.g. Barista, Cashier, Kitchen
  locale text not null default 'en' check (locale in ('en', 'ar')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Current user's role, used by every policy below.
create or replace function public.my_role()
returns public.app_role
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() and active $$;

create or replace function public.is_manager()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.my_role() in ('owner', 'manager'), false) $$;

create or replace function public.is_owner()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.my_role() = 'owner', false) $$;

-- New auth user -> profile. The very first account becomes the owner.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  first_user boolean;
begin
  select not exists (select 1 from public.profiles) into first_user;
  insert into public.profiles (id, full_name, role, locale)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    -- Role is never taken from sign-up data; managers set it from the Team page.
    case when first_user then 'owner'::public.app_role else 'staff'::public.app_role end,
    coalesce(new.raw_user_meta_data ->> 'locale', 'en')
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Only the owner may change roles; nobody can change their own active flag.
create or replace function public.guard_profile_update()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- auth.uid() is null only for trusted server-side (service role) calls.
  if auth.uid() is not null and not public.is_owner() then
    if new.role is distinct from old.role then
      raise exception 'Only the owner can change roles';
    end if;
    if old.role = 'owner' and old.id <> auth.uid() then
      raise exception 'Only the owner can edit the owner';
    end if;
  end if;
  if new.id = auth.uid() and new.active is distinct from old.active then
    raise exception 'You cannot deactivate yourself';
  end if;
  return new;
end $$;

create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-------------------------------------------------------------------------------
-- Notifications (in-app inbox)
-------------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,          -- shift, swap, event, price
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc);

create or replace function public.notify(
  p_user uuid, p_kind text, p_title text, p_body text, p_link text
) returns void
language sql security definer set search_path = public
as $$
  insert into public.notifications (user_id, kind, title, body, link)
  values (p_user, p_kind, p_title, p_body, p_link)
$$;

create or replace function public.notify_managers(
  p_kind text, p_title text, p_body text, p_link text
) returns void
language sql security definer set search_path = public
as $$
  insert into public.notifications (user_id, kind, title, body, link)
  select id, p_kind, p_title, p_body, p_link
  from public.profiles where role in ('owner', 'manager') and active
$$;

-------------------------------------------------------------------------------
-- Schedules and shift swaps
-------------------------------------------------------------------------------
create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  station text,                 -- e.g. Bar, Floor, Kitchen
  notes text,
  published boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index on public.shifts (starts_at);
create index on public.shifts (staff_id, starts_at);

create type public.swap_status as enum (
  'pending_colleague', 'pending_manager', 'approved', 'rejected', 'declined', 'cancelled'
);

create table public.swap_requests (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts (id) on delete cascade,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  target_id uuid not null references public.profiles (id) on delete cascade,
  -- optional: the colleague's shift offered in exchange (a true swap)
  target_shift_id uuid references public.shifts (id) on delete set null,
  message text,
  status public.swap_status not null default 'pending_colleague',
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.swap_requests (status);

-- Staff asks a colleague to take (or trade) a shift.
create or replace function public.request_swap(
  p_shift uuid, p_target uuid, p_target_shift uuid, p_message text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  s public.shifts;
  new_id uuid;
begin
  select * into s from public.shifts where id = p_shift;
  if s.id is null or s.staff_id <> auth.uid() then
    raise exception 'You can only swap your own shifts';
  end if;
  if p_target = auth.uid() then
    raise exception 'Pick a colleague';
  end if;
  if p_target_shift is not null and not exists (
    select 1 from public.shifts where id = p_target_shift and staff_id = p_target
  ) then
    raise exception 'That shift does not belong to the colleague';
  end if;
  insert into public.swap_requests (shift_id, requester_id, target_id, target_shift_id, message)
  values (p_shift, auth.uid(), p_target, p_target_shift, p_message)
  returning id into new_id;
  perform public.notify(p_target, 'swap', 'swap_request', p_message, '/swaps');
  return new_id;
end $$;

-- Colleague accepts or declines.
create or replace function public.respond_swap(p_id uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare r public.swap_requests;
begin
  select * into r from public.swap_requests where id = p_id for update;
  if r.target_id <> auth.uid() or r.status <> 'pending_colleague' then
    raise exception 'Not allowed';
  end if;
  if p_accept then
    update public.swap_requests set status = 'pending_manager' where id = p_id;
    perform public.notify_managers('swap', 'swap_needs_approval', null, '/swaps');
  else
    update public.swap_requests set status = 'declined', decided_at = now() where id = p_id;
  end if;
  perform public.notify(r.requester_id, 'swap',
    case when p_accept then 'swap_accepted' else 'swap_declined' end, null, '/swaps');
end $$;

-- Manager approves (shifts change hands) or rejects.
create or replace function public.decide_swap(p_id uuid, p_approve boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare r public.swap_requests;
begin
  if not public.is_manager() then raise exception 'Managers only'; end if;
  select * into r from public.swap_requests where id = p_id for update;
  if r.status <> 'pending_manager' then raise exception 'Not waiting for approval'; end if;
  if p_approve then
    update public.shifts set staff_id = r.target_id where id = r.shift_id;
    if r.target_shift_id is not null then
      update public.shifts set staff_id = r.requester_id where id = r.target_shift_id;
    end if;
  end if;
  update public.swap_requests
    set status = case when p_approve then 'approved'::public.swap_status else 'rejected' end,
        decided_by = auth.uid(), decided_at = now()
    where id = p_id;
  perform public.notify(r.requester_id, 'swap',
    case when p_approve then 'swap_approved' else 'swap_rejected' end, null, '/schedule');
  perform public.notify(r.target_id, 'swap',
    case when p_approve then 'swap_approved' else 'swap_rejected' end, null, '/schedule');
end $$;

create or replace function public.cancel_swap(p_id uuid)
returns void
language sql security definer set search_path = public
as $$
  update public.swap_requests set status = 'cancelled', decided_at = now()
  where id = p_id and requester_id = auth.uid()
    and status in ('pending_colleague', 'pending_manager')
$$;

-- Copy all shifts from one week to the next (manager).
create or replace function public.copy_week(p_from date, p_to date)
returns integer
language plpgsql security definer set search_path = public
as $$
declare n integer;
begin
  if not public.is_manager() then raise exception 'Managers only'; end if;
  insert into public.shifts (staff_id, starts_at, ends_at, station, notes, created_by)
  select staff_id,
         starts_at + (p_to - p_from) * interval '1 day',
         ends_at + (p_to - p_from) * interval '1 day',
         station, notes, auth.uid()
  from public.shifts
  where starts_at >= (p_from::timestamp at time zone 'Asia/Dubai')
    and starts_at < ((p_from + 7)::timestamp at time zone 'Asia/Dubai');
  get diagnostics n = row_count;
  return n;
end $$;

-------------------------------------------------------------------------------
-- Special events
-------------------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  guests integer,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index on public.events (starts_at);

create table public.event_staff (
  event_id uuid not null references public.events (id) on delete cascade,
  staff_id uuid not null references public.profiles (id) on delete cascade,
  duty text,
  seen_at timestamptz,
  primary key (event_id, staff_id)
);

create or replace function public.notify_event_staff()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.notify(new.staff_id, 'event', 'event_assigned',
    (select title from public.events where id = new.event_id),
    '/events/' || new.event_id);
  return new;
end $$;

create trigger event_staff_notify
  after insert on public.event_staff
  for each row execute function public.notify_event_staff();

create or replace function public.mark_event_seen(p_event uuid)
returns void
language sql security definer set search_path = public
as $$
  update public.event_staff set seen_at = coalesce(seen_at, now())
  where event_id = p_event and staff_id = auth.uid()
$$;

-------------------------------------------------------------------------------
-- Purchasing: suppliers, ingredients, invoices, price history
-------------------------------------------------------------------------------
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_ar text,
  trn text,                      -- UAE tax registration number
  phone text,
  created_at timestamptz not null default now()
);
create unique index suppliers_name_key on public.suppliers (lower(name));

-- An ingredient or supply the cafe buys. Cost is tracked per base unit (g, ml or pcs).
create table public.items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_ar text,
  category text,
  base_unit text not null default 'pcs' check (base_unit in ('g', 'ml', 'pcs')),
  unit_cost numeric(14, 6),       -- AED per base unit, excluding VAT
  unit_cost_at timestamptz,
  last_supplier_id uuid references public.suppliers (id),
  created_at timestamptz not null default now()
);
create unique index items_name_key on public.items (lower(name));

-- Remembers how an invoice line maps to an item, so it is matched automatically next time.
create table public.item_aliases (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  supplier_id uuid references public.suppliers (id) on delete cascade,
  raw_name text not null,
  pack_size numeric(14, 4),       -- base units in one invoice unit (e.g. 1 carton = 12000 ml)
  created_at timestamptz not null default now()
);
create unique index item_aliases_key
  on public.item_aliases (coalesce(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(raw_name));

create type public.invoice_status as enum ('reading', 'review', 'confirmed', 'failed');

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.suppliers (id),
  supplier_name text,            -- as read from the invoice
  invoice_number text,
  invoice_date date,
  subtotal numeric(14, 2),
  vat numeric(14, 2),
  total numeric(14, 2),
  currency text not null default 'AED',
  status public.invoice_status not null default 'reading',
  error text,
  ai_notes text,
  uploaded_by uuid references public.profiles (id),
  confirmed_by uuid references public.profiles (id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.invoices (created_at desc);

create table public.invoice_files (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  storage_path text not null,
  mime_type text not null,
  page_no integer not null default 1
);

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  line_no integer not null default 0,
  raw_name text not null,
  item_id uuid references public.items (id) on delete set null,
  quantity numeric(14, 4),
  unit text,                      -- as printed: CTN, KG, PCS, BTL...
  unit_price numeric(14, 4),      -- AED per invoice unit, excluding VAT
  line_total numeric(14, 2),
  pack_size numeric(14, 4),       -- base units per invoice unit
  base_unit text check (base_unit in ('g', 'ml', 'pcs')),
  suggested_name text,            -- clean English name proposed by the reader
  skip boolean not null default false  -- e.g. delivery fee, not an ingredient
);
create index on public.invoice_lines (invoice_id);

create table public.price_history (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  supplier_id uuid references public.suppliers (id),
  invoice_id uuid references public.invoices (id) on delete cascade,
  unit_cost numeric(14, 6) not null,    -- AED per base unit
  invoice_unit_price numeric(14, 4),
  invoice_unit text,
  recorded_on date not null default current_date,
  created_at timestamptz not null default now()
);
create index on public.price_history (item_id, recorded_on desc);

create table public.price_alerts (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  invoice_id uuid references public.invoices (id) on delete cascade,
  supplier_id uuid references public.suppliers (id),
  old_cost numeric(14, 6) not null,
  new_cost numeric(14, 6) not null,
  change_pct numeric(8, 2) not null,
  dismissed_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.price_alerts (created_at desc);

-- Confirm a reviewed invoice: record prices, raise alerts on changes, learn aliases.
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

    -- Only move the current cost forward if this invoice is not older than the last one.
    update public.items
      set unit_cost = new_cost,
          unit_cost_at = coalesce(inv.invoice_date, current_date),
          last_supplier_id = inv.supplier_id
      where id = l.item_id
        and (unit_cost_at is null or unit_cost_at <= coalesce(inv.invoice_date, current_date));

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
-- Menu and recipes
-------------------------------------------------------------------------------
create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_ar text,
  category text,
  selling_price numeric(10, 2),     -- AED incl. VAT, as on the menu
  yield_portions numeric(10, 2) not null default 1,  -- recipe makes this many portions
  notes text,
  created_at timestamptz not null default now()
);

create table public.recipe_lines (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references public.menu_items (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete restrict,
  quantity numeric(14, 4) not null check (quantity > 0),  -- in the item's base unit
  waste_pct numeric(5, 2) not null default 0,
  sort integer not null default 0
);
create index on public.recipe_lines (menu_item_id);

create or replace view public.menu_item_costs
with (security_invoker = true) as
select
  m.id as menu_item_id,
  round(coalesce(sum(r.quantity * (1 + r.waste_pct / 100) * i.unit_cost), 0) / nullif(m.yield_portions, 0), 4)
    as portion_cost,
  count(r.id) filter (where i.unit_cost is null) as missing_prices,
  count(r.id) as ingredient_count
from public.menu_items m
left join public.recipe_lines r on r.menu_item_id = m.id
left join public.items i on i.id = r.item_id
group by m.id, m.yield_portions;

-------------------------------------------------------------------------------
-- Row level security
-------------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.notifications enable row level security;
alter table public.shifts enable row level security;
alter table public.swap_requests enable row level security;
alter table public.events enable row level security;
alter table public.event_staff enable row level security;
alter table public.suppliers enable row level security;
alter table public.items enable row level security;
alter table public.item_aliases enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_files enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.price_history enable row level security;
alter table public.price_alerts enable row level security;
alter table public.menu_items enable row level security;
alter table public.recipe_lines enable row level security;

-- Everyone signed in can see the team (names for schedules and swaps).
create policy "team visible" on public.profiles for select to authenticated using (true);
create policy "edit own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy "managers edit profiles" on public.profiles for update to authenticated
  using (public.is_manager()) with check (public.is_manager());

create policy "own notifications" on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy "mark own read" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "schedule visible" on public.shifts for select to authenticated
  using (published or public.is_manager());
create policy "managers write shifts" on public.shifts for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

create policy "swap parties and managers" on public.swap_requests for select to authenticated
  using (requester_id = auth.uid() or target_id = auth.uid() or public.is_manager());

create policy "events visible" on public.events for select to authenticated using (true);
create policy "managers write events" on public.events for all to authenticated
  using (public.is_manager()) with check (public.is_manager());
create policy "event staff visible" on public.event_staff for select to authenticated using (true);
create policy "managers write event staff" on public.event_staff for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- Purchasing and costing: owner and managers only.
create policy "mgr suppliers" on public.suppliers for all to authenticated
  using (public.is_manager()) with check (public.is_manager());
create policy "mgr items" on public.items for all to authenticated
  using (public.is_manager()) with check (public.is_manager());
create policy "mgr aliases" on public.item_aliases for all to authenticated
  using (public.is_manager()) with check (public.is_manager());
create policy "mgr invoices" on public.invoices for all to authenticated
  using (public.is_manager()) with check (public.is_manager());
create policy "mgr invoice files" on public.invoice_files for all to authenticated
  using (public.is_manager()) with check (public.is_manager());
create policy "mgr invoice lines" on public.invoice_lines for all to authenticated
  using (public.is_manager()) with check (public.is_manager());
create policy "mgr price history" on public.price_history for select to authenticated
  using (public.is_manager());
create policy "mgr price alerts" on public.price_alerts for all to authenticated
  using (public.is_manager()) with check (public.is_manager());
create policy "mgr menu" on public.menu_items for all to authenticated
  using (public.is_manager()) with check (public.is_manager());
create policy "mgr recipes" on public.recipe_lines for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-------------------------------------------------------------------------------
-- Storage for invoice photos and PDFs (private)
-------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('invoices', 'invoices', false, 20971520)
on conflict (id) do nothing;

create policy "mgr read invoice files" on storage.objects for select to authenticated
  using (bucket_id = 'invoices' and public.is_manager());
create policy "mgr upload invoice files" on storage.objects for insert to authenticated
  with check (bucket_id = 'invoices' and public.is_manager());
create policy "mgr delete invoice files" on storage.objects for delete to authenticated
  using (bucket_id = 'invoices' and public.is_manager());

-- Functions callable by signed-in users
revoke execute on function public.notify(uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.notify_managers(text, text, text, text) from public, anon, authenticated;
