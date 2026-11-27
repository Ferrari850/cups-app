-- Finance: VAT settings, business expenses, and one report for P&L and the VAT 201 return.
-- Run once on top of 0005, in the Supabase SQL editor. Safe to run more than once.
-- All or nothing: if any step fails, nothing is changed.
begin;

-------------------------------------------------------------------------------
-- VAT settings on the single cafe_settings row
-------------------------------------------------------------------------------
alter table public.cafe_settings
  add column if not exists legal_name text,                           -- name on the VAT certificate
  add column if not exists vat_emirate text not null default 'dubai', -- VAT 201 box 1 row for sales
  add column if not exists vat_period text not null default 'quarterly',
  add column if not exists vat_first_month integer not null default 1; -- month a VAT quarter starts (1, 2 or 3)

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cafe_settings_vat_check') then
    alter table public.cafe_settings add constraint cafe_settings_vat_check check (
      vat_emirate in ('abu_dhabi', 'dubai', 'sharjah', 'ajman', 'umm_al_quwain', 'ras_al_khaimah', 'fujairah')
      and vat_period in ('monthly', 'quarterly')
      and vat_first_month between 1 and 3);
  end if;
end $$;

-------------------------------------------------------------------------------
-- Business expenses that are not ingredient invoices: rent, salaries, DEWA, app fees...
-------------------------------------------------------------------------------
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null default (now() at time zone 'Asia/Dubai')::date,
  category text not null check (category in
    ('rent', 'salaries', 'utilities', 'platform_fees', 'marketing', 'maintenance', 'licenses',
     'supplies', 'bank_fees', 'insurance', 'other')),
  payee text,
  payee_trn text,
  reference text,                               -- the supplier's invoice number
  description text,
  amount numeric(12, 2) not null check (amount >= 0),  -- excluding VAT
  vat numeric(12, 2) not null default 0 check (vat >= 0),
  has_tax_invoice boolean not null default false,      -- VAT is only recoverable with a tax invoice
  paid_by text check (paid_by in ('cash', 'card', 'bank', 'other')),
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists expenses_date_idx on public.expenses (expense_date desc);
alter table public.expenses enable row level security;
grant select, insert, update, delete on public.expenses to authenticated;
drop policy if exists "mgr expenses" on public.expenses;
create policy "mgr expenses" on public.expenses for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-------------------------------------------------------------------------------
-- Finance report for a date range (Dubai business days). Owner and managers only.
-- Sales count on the order's business day; a refund counts on the day it was made,
-- like a credit note, so a period already filed is never changed afterwards.
-------------------------------------------------------------------------------
create or replace function public.finance_report(p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare res jsonb;
begin
  if not public.is_manager() then raise exception 'Managers only'; end if;
  with o as (
    select * from public.orders where business_date between p_from and p_to
  ), ok as (
    select * from o where status <> 'cancelled'
  ), r as (
    select * from public.orders
    where status = 'cancelled' and refunded > 0
      and (status_at at time zone 'Asia/Dubai')::date between p_from and p_to
  ), inv as (
    select i.*, s.trn as supplier_trn, coalesce(s.name, i.supplier_name) as supplier
    from public.invoices i left join public.suppliers s on s.id = i.supplier_id
    where i.status in ('review', 'confirmed')
      and coalesce(i.invoice_date, (i.created_at at time zone 'Asia/Dubai')::date) between p_from and p_to
  ), ex as (
    select * from public.expenses where expense_date between p_from and p_to
  )
  select jsonb_build_object(
    'sales', (select jsonb_build_object(
        'orders', count(*), 'gross', coalesce(sum(total), 0), 'vat', coalesce(sum(vat), 0)) from o),
    'refunds', (select jsonb_build_object(
        'orders', count(*), 'gross', coalesce(sum(refunded), 0),
        'vat', coalesce(sum(round(refunded - refunded / 1.05, 2)), 0)) from r),
    'cogs', (select coalesce(sum(cost), 0) from ok),
    'commission', (select coalesce(sum(commission), 0) from ok),
    'uncosted_sales', (select coalesce(sum(l.line_total), 0)
        from public.order_lines l join ok on ok.id = l.order_id where coalesce(l.unit_cost, 0) = 0),
    'waste', (select coalesce(sum(-m.qty * coalesce(i.unit_cost, 0)), 0)
        from public.stock_movements m join public.items i on i.id = m.item_id
        where m.kind = 'waste' and (m.created_at at time zone 'Asia/Dubai')::date between p_from and p_to),
    'by_channel', (select coalesce(jsonb_agg(x order by x.gross desc), '[]') from (
        select c.code, c.name, c.name_ar, c.is_app, c.commission_pct, count(*) as orders,
               sum(ok.total) as gross, sum(ok.vat) as vat, sum(ok.cost) as cost, sum(ok.commission) as commission
        from ok join public.channels c on c.id = ok.channel_id group by c.id) x),
    'by_method', (select coalesce(jsonb_agg(x order by x.amount desc), '[]') from (
        select method, sum(amount) as amount, count(*) filter (where amount > 0) as payments
        from public.payments
        where (created_at at time zone 'Asia/Dubai')::date between p_from and p_to group by method) x),
    'by_month', (select coalesce(jsonb_agg(x order by x.month), '[]') from (
        select to_char(business_date, 'YYYY-MM') as month, count(*) as orders,
               sum(total) as gross, sum(vat) as vat, sum(cost) as cost, sum(commission) as commission
        from ok group by 1) x),
    'purchases', (select coalesce(jsonb_agg(x order by x.date, x.supplier), '[]') from (
        select id, status, supplier, supplier_trn, invoice_number,
               coalesce(invoice_date, (created_at at time zone 'Asia/Dubai')::date) as date,
               coalesce(subtotal, coalesce(total, 0) - coalesce(vat, 0)) as net,
               coalesce(vat, 0) as vat,
               coalesce(total, coalesce(subtotal, 0) + coalesce(vat, 0)) as total
        from inv) x),
    'pending_invoices', (select count(*) from public.invoices
        where status in ('reading', 'failed')
          and coalesce(invoice_date, (created_at at time zone 'Asia/Dubai')::date) between p_from and p_to),
    'expenses', (select coalesce(jsonb_agg(x order by x.expense_date, x.created_at), '[]') from (
        select id, expense_date, category, payee, payee_trn, reference, description, amount, vat,
               has_tax_invoice, paid_by, created_at from ex) x)
  ) into res;
  return res;
end $$;

revoke execute on function public.finance_report(date, date) from public, anon;
grant execute on function public.finance_report(date, date) to authenticated;

commit;
