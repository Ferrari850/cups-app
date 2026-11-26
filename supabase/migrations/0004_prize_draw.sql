-- Customer prize draw: an order over a set total (default 50 AED) can be entered once,
-- with the customer's name and phone, if they want to. Owner and managers see the entries
-- and pick a random winner. Phone numbers are kept only here, for the draw, and can be
-- deleted once a draw is done.
-- Safe to run more than once.
begin;

alter table public.cafe_settings add column if not exists draw_enabled boolean not null default true;
alter table public.cafe_settings add column if not exists draw_min_total numeric(10, 2) not null default 50;
-- So the receipt (which every cashier can print) can show the draw entry and the phone to call.
alter table public.orders add column if not exists in_draw boolean not null default false;

create table if not exists public.prize_draws (
  id uuid primary key default gen_random_uuid(),
  from_date date not null,
  to_date date not null,
  entries integer not null,                  -- how many entries were in the hat
  winner_name text not null,
  winner_phone text not null,
  winner_invoice_no bigint,
  drawn_by uuid references public.profiles (id),
  drawn_at timestamptz not null default now()
);

create table if not exists public.draw_entries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete cascade,  -- one entry per invoice
  customer_name text not null,
  phone text not null,
  business_date date not null,
  won_draw_id uuid references public.prize_draws (id) on delete set null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists draw_entries_date on public.draw_entries (business_date);

alter table public.prize_draws enable row level security;
alter table public.draw_entries enable row level security;

-- Only the owner and managers can see phone numbers. Staff add entries through enter_draw().
drop policy if exists "mgr draw entries" on public.draw_entries;
drop policy if exists "mgr draw entries delete" on public.draw_entries;
drop policy if exists "mgr prize draws" on public.prize_draws;
create policy "mgr draw entries" on public.draw_entries for select to authenticated using (public.is_manager());
create policy "mgr draw entries delete" on public.draw_entries for delete to authenticated using (public.is_manager());
create policy "mgr prize draws" on public.prize_draws for select to authenticated using (public.is_manager());

/** Cashier enters a paid order into the draw. The order must be from today and over the minimum. */
create or replace function public.enter_draw(p_order uuid, p_name text, p_phone text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  o public.orders;
  s public.cafe_settings;
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
  v_name text := trim(coalesce(p_name, ''));
begin
  if public.my_role() is null then raise exception 'Not allowed'; end if;
  select * into s from public.cafe_settings limit 1;
  if not coalesce(s.draw_enabled, false) then raise exception 'draw_off'; end if;
  select * into o from public.orders where id = p_order;
  if o.id is null then raise exception 'order_not_found'; end if;
  if o.business_date < (now() at time zone 'Asia/Dubai')::date - 1 then raise exception 'draw_too_late'; end if;
  if o.total - coalesce(o.refunded, 0) <= s.draw_min_total then raise exception 'draw_under_min'; end if;
  if length(v_name) < 2 then raise exception 'draw_bad_name'; end if;
  if length(regexp_replace(v_phone, '[^0-9]', '', 'g')) not between 7 and 15 then raise exception 'draw_bad_phone'; end if;
  if exists (select 1 from public.draw_entries where order_id = o.id) then raise exception 'draw_already'; end if;
  insert into public.draw_entries (order_id, customer_name, phone, business_date, created_by)
  values (o.id, left(v_name, 80), v_phone, o.business_date, auth.uid());
  -- Printed on the receipt, so the cafe can call the customer if they win.
  update public.orders set in_draw = true,
    customer_name = coalesce(customer_name, left(v_name, 80)),
    customer_phone = v_phone
  where id = o.id;
end $$;

/** Owner or manager picks one random entry between two dates (each invoice is one chance). */
create or replace function public.pick_draw_winner(p_from date, p_to date)
returns public.prize_draws
language plpgsql security definer set search_path = public
as $$
declare
  e record;
  n integer;
  d public.prize_draws;
begin
  if not public.is_manager() then raise exception 'Managers only'; end if;
  select count(*) into n from public.draw_entries de
    join public.orders o on o.id = de.order_id
    where de.business_date between p_from and p_to and de.won_draw_id is null
      and o.total - coalesce(o.refunded, 0) > 0;
  if n = 0 then raise exception 'draw_no_entries'; end if;
  select de.*, o.invoice_no into e from public.draw_entries de
    join public.orders o on o.id = de.order_id
    where de.business_date between p_from and p_to and de.won_draw_id is null
      and o.total - coalesce(o.refunded, 0) > 0
    order by gen_random_uuid() limit 1;
  insert into public.prize_draws (from_date, to_date, entries, winner_name, winner_phone, winner_invoice_no, drawn_by)
  values (p_from, p_to, n, e.customer_name, e.phone, e.invoice_no, auth.uid())
  returning * into d;
  update public.draw_entries set won_draw_id = d.id where id = e.id;
  return d;
end $$;

/** Deleting entries after a draw also clears the phone kept on the order for the receipt. */
create or replace function public.forget_draw_phone()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update public.orders set customer_phone = null, in_draw = false
  where id = old.order_id and in_draw;
  return old;
end $$;
drop trigger if exists draw_entries_forget on public.draw_entries;
create trigger draw_entries_forget after delete on public.draw_entries
  for each row execute function public.forget_draw_phone();

revoke all on function public.enter_draw(uuid, text, text) from public, anon;
revoke all on function public.pick_draw_winner(date, date) from public, anon;
grant execute on function public.enter_draw(uuid, text, text) to authenticated;
grant execute on function public.pick_draw_winner(date, date) to authenticated;

commit;
