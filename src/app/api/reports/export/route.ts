import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Report } from "@/lib/reports";

const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: unknown[][]) => "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");

/** Excel-friendly CSV of sales by item, or every order with its lines. Managers only. */
export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from") ?? "";
  const to = req.nextUrl.searchParams.get("to") ?? "";
  const kind = req.nextUrl.searchParams.get("kind") ?? "items";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: "bad dates" }, { status: 400 });
  }
  const supabase = await createClient();
  const { data: rep, error } = await supabase.rpc("sales_report", { p_from: from, p_to: to });
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });

  let body: string;
  if (kind === "orders") {
    const rows: unknown[][] = [["Date", "Time", "Invoice", "Ticket", "Channel", "Status", "Item", "Add-ons", "Qty", "Unit price", "Line total", "Order total", "VAT", "Commission", "Car plate", "App ref", "Payments"]];
    for (let page = 0; ; page++) {
      const { data } = await supabase
        .from("orders")
        .select("business_date, created_at, invoice_no, ticket_no, status, total, vat, commission, car_plate, external_ref, channels(name), order_lines(name, qty, unit_price, line_total, modifiers), payments(method, amount)")
        .gte("business_date", from)
        .lte("business_date", to)
        .order("created_at")
        .range(page * 500, page * 500 + 499);
      const list = (data ?? []) as unknown as {
        business_date: string; created_at: string; invoice_no: number; ticket_no: number; status: string; total: number; vat: number; commission: number; car_plate: string | null; external_ref: string | null;
        channels: { name: string } | null; order_lines: { name: string; qty: number; unit_price: number; line_total: number; modifiers: { name: string }[] }[]; payments: { method: string; amount: number }[];
      }[];
      for (const o of list) {
        const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", hour: "2-digit", minute: "2-digit" }).format(new Date(o.created_at));
        const pays = o.payments.map((p) => `${p.method} ${p.amount}`).join(" + ");
        for (const l of o.order_lines) {
          rows.push([o.business_date, time, o.invoice_no, o.ticket_no, o.channels?.name, o.status, l.name, l.modifiers.map((m) => m.name).join(" + "), l.qty, l.unit_price, l.line_total, o.total, o.vat, o.commission, o.car_plate, o.external_ref, pays]);
        }
      }
      if (list.length < 500) break;
    }
    body = csv(rows);
  } else {
    const r = rep as Report;
    body = csv([
      ["Item", "Arabic", "Category", "Qty", "Sales incl. VAT", "Ingredient cost"],
      ...r.by_item.map((i) => [i.name, i.name_ar, i.category, i.qty, i.sales, Number(i.cost).toFixed(2)]),
      [],
      ["Channel", "", "", "Orders", "Sales incl. VAT", "Ingredient cost", "VAT", "Commission"],
      ...r.by_channel.map((c) => [c.name, c.name_ar, "", c.orders, c.sales, Number(c.cost).toFixed(2), c.vat, c.commission]),
    ]);
  }
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cups-${kind}-${from}-to-${to}.csv"`,
    },
  });
}
