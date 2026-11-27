import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { invoiceNo } from "@/lib/pos";
import { profitAndLoss, vat201, type FinanceReport, type VatSettings } from "@/lib/finance";

const cell = (v: unknown) => {
  const s = v == null ? "" : typeof v === "number" ? String(Math.round(v * 100) / 100) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: unknown[][]) => "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
const EMIRATE: Record<string, string> = {
  abu_dhabi: "Abu Dhabi", dubai: "Dubai", sharjah: "Sharjah", ajman: "Ajman",
  umm_al_quwain: "Umm Al Quwain", ras_al_khaimah: "Ras Al Khaimah", fujairah: "Fujairah",
};

/** Excel-friendly CSVs for the FTA or the accountant: VAT 201, P&L, and the sales, purchase and expense ledgers. Managers only. */
export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from") ?? "";
  const to = req.nextUrl.searchParams.get("to") ?? "";
  const kind = req.nextUrl.searchParams.get("kind") ?? "vat";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: "bad dates" }, { status: 400 });
  }
  const supabase = await createClient();
  const [{ data, error }, { data: settings }] = await Promise.all([
    supabase.rpc("finance_report", { p_from: from, p_to: to }),
    supabase.from("cafe_settings").select("*").maybeSingle(),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  const rep = data as FinanceReport;
  const s = (settings ?? {}) as VatSettings & { name?: string; invoice_prefix?: string };
  const head = [[s.legal_name || s.name || "CUPS"], ["TRN", s.trn ?? ""], ["Period", from, to], ["Currency", "AED"], []];

  let rows: unknown[][];
  if (kind === "pl") {
    const pl = profitAndLoss(rep);
    rows = [
      ...head,
      ["Profit and loss", "AED excl. VAT"],
      ["Sales excl. VAT", pl.salesNet],
      ["Less refunds", -pl.refundsNet],
      ["Net revenue", pl.revenue],
      ["Cost of goods sold (recipe cost)", -pl.cogs],
      ["Gross profit", pl.grossProfit],
      ["Gross margin %", pl.grossMargin?.toFixed(1) ?? ""],
      [pl.platformIsEstimate ? "Delivery app commission (estimated from commission %)" : "Delivery app commission", -pl.platform],
      ["Waste", -pl.waste],
      ...pl.opex.map((o) => [`Expense: ${o.category}`, -o.amount]),
      ["Total expenses", -pl.opexTotal],
      ["Net profit", pl.netProfit],
      ["Net margin %", pl.netMargin?.toFixed(1) ?? ""],
      [],
      ["Ingredient purchases on invoices excl. VAT (for comparison)", pl.purchasesNet],
      ["Share of sales with no recipe cost %", pl.uncostedShare.toFixed(1)],
    ];
  } else if (kind === "sales") {
    rows = [...head, ["Date", "Type", "Invoice no", "Ticket", "Channel", "Status", "Total incl. VAT", "VAT", "Excl. VAT", "Commission", "App ref", "Payments", "Refund reason"]];
    type O = {
      business_date: string; status_at: string; invoice_no: number; ticket_no: number; status: string; total: number; vat: number; commission: number;
      refunded: number; refund_reason: string | null; external_ref: string | null; channels: { name: string } | null; payments: { method: string; amount: number }[];
    };
    const cols = "business_date, status_at, invoice_no, ticket_no, status, total, vat, commission, refunded, refund_reason, external_ref, channels(name), payments(method, amount)";
    const fetchAll = async (q: (p: number) => PromiseLike<{ data: unknown }>) => {
      const out: O[] = [];
      for (let page = 0; ; page++) {
        const { data } = await q(page);
        const list = (data ?? []) as O[];
        out.push(...list);
        if (list.length < 500) break;
      }
      return out;
    };
    const sold = await fetchAll((p) => supabase.from("orders").select(cols).gte("business_date", from).lte("business_date", to).order("created_at").range(p * 500, p * 500 + 499));
    for (const o of sold) {
      rows.push([o.business_date, "Sale", invoiceNo(s.invoice_prefix, o.invoice_no), o.ticket_no, o.channels?.name, o.status, o.total, o.vat, Number(o.total) - Number(o.vat),
        o.commission, o.external_ref, o.payments.filter((p) => p.amount > 0).map((p) => `${p.method} ${p.amount}`).join(" + "), ""]);
    }
    // Refunds count on the day they were made (Dubai time), like a credit note.
    const startUtc = new Date(`${from}T00:00:00+04:00`).toISOString();
    const endUtc = new Date(new Date(`${to}T00:00:00+04:00`).getTime() + 86_400_000).toISOString();
    const refunded = await fetchAll((p) => supabase.from("orders").select(cols).eq("status", "cancelled").gt("refunded", 0).gte("status_at", startUtc).lt("status_at", endUtc).order("status_at").range(p * 500, p * 500 + 499));
    for (const o of refunded) {
      const vat = Math.round((o.refunded - o.refunded / 1.05) * 100) / 100;
      const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date(o.status_at));
      rows.push([day, "Refund", invoiceNo(s.invoice_prefix, o.invoice_no), o.ticket_no, o.channels?.name, "refunded", -o.refunded, -vat, -(o.refunded - vat), "", o.external_ref, "", o.refund_reason]);
    }
  } else if (kind === "purchases") {
    rows = [...head, ["Date", "Supplier", "Supplier TRN", "Invoice no", "Excl. VAT", "VAT", "Total", "Status"]];
    for (const p of rep.purchases) rows.push([p.date, p.supplier, p.supplier_trn, p.invoice_number, p.net, p.vat, p.total, p.status === "review" ? "needs review" : "saved"]);
    rows.push([], ["Total", "", "", "", rep.purchases.reduce((a, p) => a + Number(p.net), 0), rep.purchases.reduce((a, p) => a + Number(p.vat), 0), rep.purchases.reduce((a, p) => a + Number(p.total), 0)]);
  } else if (kind === "expenses") {
    rows = [...head, ["Date", "Category", "Paid to", "Their TRN", "Invoice no", "Description", "Excl. VAT", "VAT", "Tax invoice", "VAT recoverable", "Paid by"]];
    for (const e of rep.expenses)
      rows.push([e.expense_date, e.category, e.payee, e.payee_trn, e.reference, e.description, e.amount, e.vat, e.has_tax_invoice ? "yes" : "no", e.has_tax_invoice ? e.vat : 0, e.paid_by]);
  } else {
    const v = vat201(rep, s);
    rows = [
      ...head,
      ["VAT 201", "Description", "Amount (AED)", "VAT amount (AED)", "Adjustment (AED)"],
      ...v.box1.map((b) => [b.box, `Standard rated supplies in ${EMIRATE[b.emirate]}`, b.amount, b.vat, b.adjustment]),
      ["2", "Tax refunds provided to tourists", 0, 0, 0],
      ["3", "Supplies subject to the reverse charge", 0, 0, ""],
      ["4", "Zero rated supplies", 0, "", ""],
      ["5", "Exempt supplies", 0, "", ""],
      ["6", "Goods imported into the UAE", 0, 0, ""],
      ["7", "Adjustments to goods imported into the UAE", 0, 0, ""],
      ["8", "Totals", v.box8.amount, v.box8.vat, v.box8.adjustment],
      ["9", "Standard rated expenses", v.box9.amount, v.box9.vat, v.box9.adjustment],
      ["10", "Supplies subject to the reverse charge provisions", 0, 0, ""],
      ["11", "Totals", v.box11.amount, v.box11.vat, v.box11.adjustment],
      [],
      ["12", "Total value of due tax for the period", "", v.box12],
      ["13", "Total value of recoverable tax for the period", "", v.box13],
      ["14", "Payable tax for the period", "", v.box14],
      [],
      ["Note", "Prepared from the Cups app records. Not tax advice: check before filing on EmaraTax."],
    ];
  }
  return new NextResponse(csv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cups-${kind}-${from}-to-${to}.csv"`,
    },
  });
}
