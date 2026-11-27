-- Price lists: upload photos of a list of ingredient costs (several pages at once, from the
-- phone camera or gallery). Claude reads them like an invoice and you link each line to an
-- ingredient. Saving records the cost in price history, so price change alerts still work.
-- A price list is not a purchase: it adds no stock and is left out of Finance and VAT.
-- Safe to run more than once.
begin;

alter table public.invoices add column if not exists kind text not null default 'invoice';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'invoices_kind_check') then
    alter table public.invoices add constraint invoices_kind_check check (kind in ('invoice', 'price_list'));
  end if;
end $$;

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
      and not il.applied
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

    -- A price list only updates costs; stock comes in on real invoices.
    if inv.kind = 'invoice' and coalesce(l.quantity, 0) > 0 then
      insert into public.stock_movements (item_id, qty, kind, invoice_id, created_by, note)
      values (l.item_id, l.quantity * l.pack_size, 'purchase', p_invoice, auth.uid(), inv.supplier_name);
    end if;

    insert into public.item_aliases (item_id, supplier_id, raw_name, pack_size)
    values (l.item_id, inv.supplier_id, l.raw_name, l.pack_size)
    on conflict (coalesce(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(raw_name))
    do update set item_id = excluded.item_id, pack_size = excluded.pack_size;

    update public.invoice_lines set applied = true where id = l.id;
  end loop;

  update public.invoices
    set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = coalesce(confirmed_at, now())
    where id = p_invoice;
  return alerts;
end $$;

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
      and i.kind = 'invoice'
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
        where status in ('reading', 'failed') and kind = 'invoice'
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
