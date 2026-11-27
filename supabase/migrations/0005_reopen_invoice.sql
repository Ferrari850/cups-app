-- Reopen a saved invoice to link lines that were skipped or left unlinked.
-- Each line now remembers whether its price and stock were already saved (applied).
-- Confirming again only saves the lines that were not saved before, so stock and
-- price history are never counted twice.
-- Also reopens every saved invoice that still has lines that were not saved.
-- Safe to run more than once.
begin;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'invoice_lines' and column_name = 'applied'
  ) then
    alter table public.invoice_lines add column applied boolean not null default false;

    -- Lines of saved invoices that the old confirm step already saved.
    update public.invoice_lines il set applied = true
      from public.invoices i
      where i.id = il.invoice_id and i.status = 'confirmed'
        and il.item_id is not null and not il.skip
        and il.unit_price is not null and coalesce(il.pack_size, 0) > 0;

    -- Fahad asked (2026-11-27) to reopen saved invoices that have lines not linked yet.
    update public.invoices i set status = 'review'
      where i.status = 'confirmed'
        and exists (select 1 from public.invoice_lines il where il.invoice_id = i.id and not il.applied);
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

    if coalesce(l.quantity, 0) > 0 then
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

create or replace function public.reopen_invoice(p_invoice uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_manager() then raise exception 'Managers only'; end if;
  update public.invoices set status = 'review'
    where id = p_invoice and status = 'confirmed';
  if not found then raise exception 'Invoice is not saved'; end if;
end $$;

revoke execute on function public.reopen_invoice(uuid) from public, anon;
grant execute on function public.reopen_invoice(uuid) to authenticated;

commit;
