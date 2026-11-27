import { addDays, dubaiDate } from "./format";

/** UAE VAT standard rate (Federal Decree-Law No. 8 of 2017). Menu prices include it. */
export const VAT_RATE = 0.05;

export const EMIRATES = ["abu_dhabi", "dubai", "sharjah", "ajman", "umm_al_quwain", "ras_al_khaimah", "fujairah"] as const;
export type Emirate = (typeof EMIRATES)[number];

export const EXPENSE_CATEGORIES = [
  "rent", "salaries", "utilities", "platform_fees", "marketing", "maintenance",
  "licenses", "supplies", "bank_fees", "insurance", "other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export type Expense = {
  id: string;
  expense_date: string;
  category: ExpenseCategory;
  payee: string | null;
  payee_trn: string | null;
  reference: string | null;
  description: string | null;
  amount: number;
  vat: number;
  has_tax_invoice: boolean;
  paid_by: string | null;
  created_at: string;
};

export type Purchase = {
  id: string;
  status: "review" | "confirmed";
  supplier: string | null;
  supplier_trn: string | null;
  invoice_number: string | null;
  date: string;
  net: number;
  vat: number;
  total: number;
};

export type FinanceReport = {
  sales: { orders: number; gross: number; vat: number };
  refunds: { orders: number; gross: number; vat: number };
  cogs: number;
  commission: number;
  uncosted_sales: number;
  waste: number;
  by_channel: { code: string; name: string; name_ar: string | null; is_app: boolean; commission_pct: number; orders: number; gross: number; vat: number; cost: number; commission: number }[];
  by_method: { method: string; amount: number; payments: number }[];
  by_month: { month: string; orders: number; gross: number; vat: number; cost: number; commission: number }[];
  purchases: Purchase[];
  pending_invoices: number;
  expenses: Expense[];
};

export type VatSettings = {
  trn: string | null;
  legal_name?: string | null;
  vat_emirate?: Emirate;
  vat_period?: "monthly" | "quarterly";
  vat_first_month?: number;
};

const n = (v: unknown) => Number(v ?? 0) || 0;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** A UAE TRN is 15 digits (most start with 100, but not all: e.g. 105...). */
export const validTrn = (trn: string | null | undefined) => !!trn && /^\d{15}$/.test(trn.replace(/\s|-/g, ""));

function monthEnd(y: number, m: number) {
  // m is 1-12; day 0 of the next month is the last day of this one
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
const ymd = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}-01`;

/** The VAT period (month or quarter) that contains a date, given the month the cafe's quarters start in. */
export function vatPeriodOf(date: string, s: VatSettings) {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  if (s.vat_period === "monthly") return { from: ymd(y, m), to: monthEnd(y, m) };
  const first = s.vat_first_month ?? 1;
  // months since the stagger start, wrapped into quarters
  const offset = (((m - first) % 3) + 3) % 3;
  let sm = m - offset;
  let sy = y;
  if (sm < 1) { sm += 12; sy -= 1; }
  let em = sm + 2;
  let ey = sy;
  if (em > 12) { em -= 12; ey += 1; }
  return { from: ymd(sy, sm), to: monthEnd(ey, em) };
}

/** Return due 28 days after the end of the tax period (FTA). */
export const vatDueDate = (periodEnd: string) => addDays(periodEnd, 28);

export function financeRange(sp: { range?: string; from?: string; to?: string }, s: VatSettings) {
  const today = dubaiDate();
  const ok = (d?: string) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
  if (ok(sp.from) && ok(sp.to)) return { range: "custom", from: sp.from!, to: sp.to! };
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  switch (sp.range) {
    case "month":
      return { range: "month", from: ymd(y, m), to: today };
    case "last_month": {
      const lm = m === 1 ? 12 : m - 1;
      const ly = m === 1 ? y - 1 : y;
      return { range: "last_month", from: ymd(ly, lm), to: monthEnd(ly, lm) };
    }
    case "last_vat": {
      const cur = vatPeriodOf(today, s);
      const prev = vatPeriodOf(addDays(cur.from, -1), s);
      return { range: "last_vat", ...prev };
    }
    case "ytd":
      return { range: "ytd", from: `${y}-01-01`, to: today };
    case "last_year":
      return { range: "last_year", from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    default: {
      const cur = vatPeriodOf(today, s);
      return { range: "vat", from: cur.from, to: today < cur.to ? today : cur.to, periodEnd: cur.to };
    }
  }
}

/** Profit and loss, all amounts in AED excluding VAT. */
export function profitAndLoss(rep: FinanceReport) {
  const salesNet = n(rep.sales.gross) - n(rep.sales.vat);
  const refundsNet = n(rep.refunds.gross) - n(rep.refunds.vat);
  const revenue = r2(salesNet - refundsNet);
  const cogs = r2(n(rep.cogs));
  const gross = r2(revenue - cogs);
  // Platform fees: use what was entered from the app's own statements; until then, the estimate from commission %.
  const platformActual = rep.expenses.filter((e) => e.category === "platform_fees");
  const platformIsEstimate = platformActual.length === 0;
  const byCat = new Map<ExpenseCategory, number>();
  for (const e of rep.expenses) {
    if (e.category === "platform_fees") continue;
    // VAT without a tax invoice cannot be reclaimed, so it is part of the cost.
    const cost = n(e.amount) + (e.has_tax_invoice ? 0 : n(e.vat));
    byCat.set(e.category, (byCat.get(e.category) ?? 0) + cost);
  }
  const platform = platformIsEstimate
    ? n(rep.commission)
    : platformActual.reduce((s, e) => s + n(e.amount) + (e.has_tax_invoice ? 0 : n(e.vat)), 0);
  const waste = r2(n(rep.waste));
  const opex = [...byCat.entries()].map(([category, amount]) => ({ category, amount: r2(amount) }))
    .sort((a, b) => b.amount - a.amount);
  const opexTotal = r2(opex.reduce((s, x) => s + x.amount, 0) + platform + waste);
  const net = r2(gross - opexTotal);
  const salesGross = n(rep.sales.gross) - n(rep.refunds.gross);
  return {
    salesGross: r2(salesGross),
    salesNet: r2(salesNet),
    refundsNet: r2(refundsNet),
    revenue,
    cogs,
    grossProfit: gross,
    grossMargin: revenue > 0 ? (gross / revenue) * 100 : null,
    platform: r2(platform),
    platformIsEstimate,
    waste,
    opex,
    opexTotal,
    netProfit: net,
    netMargin: revenue > 0 ? (net / revenue) * 100 : null,
    uncostedShare: n(rep.sales.gross) > 0 ? (n(rep.uncosted_sales) / n(rep.sales.gross)) * 100 : 0,
    purchasesNet: r2(rep.purchases.reduce((s, p) => s + n(p.net), 0)),
  };
}

export type VatRow = { box: string; amount: number; vat: number; adjustment: number };

/** The VAT 201 return in the FTA layout, computed from POS sales, invoices and expenses. */
export function vat201(rep: FinanceReport, s: VatSettings) {
  const emirate = s.vat_emirate ?? "dubai";
  const salesNet = r2(n(rep.sales.gross) - n(rep.sales.vat));
  const refundNet = r2(n(rep.refunds.gross) - n(rep.refunds.vat));
  // Refunds act like credit notes: they reduce box 1 in the period they are made (the Adjustment
  // column is for bad debt relief, which a cafe paid at the counter does not have).
  const box1 = EMIRATES.map((e, i) => ({
    box: `1${"abcdefg"[i]}`,
    emirate: e,
    amount: e === emirate ? r2(salesNet - refundNet) : 0,
    vat: e === emirate ? r2(n(rep.sales.vat) - n(rep.refunds.vat)) : 0,
    adjustment: 0,
  }));
  const zero = (box: string): VatRow => ({ box, amount: 0, vat: 0, adjustment: 0 });

  // Box 9: purchases and expenses with recoverable VAT (a tax invoice showing VAT).
  const purchasesWithVat = rep.purchases.filter((p) => n(p.vat) > 0);
  const expensesWithVat = rep.expenses.filter((e) => e.has_tax_invoice && n(e.vat) > 0);
  const box9 = {
    box: "9",
    amount: r2(purchasesWithVat.reduce((a, p) => a + n(p.net), 0) + expensesWithVat.reduce((a, e) => a + n(e.amount), 0)),
    vat: r2(purchasesWithVat.reduce((a, p) => a + n(p.vat), 0) + expensesWithVat.reduce((a, e) => a + n(e.vat), 0)),
    adjustment: 0,
  };
  const outRows: VatRow[] = [...box1, zero("2"), zero("3"), zero("4"), zero("5"), zero("6"), zero("7")];
  const box8 = {
    box: "8",
    amount: r2(outRows.reduce((a, x) => a + x.amount, 0)),
    vat: r2(outRows.reduce((a, x) => a + x.vat, 0)),
    adjustment: r2(outRows.reduce((a, x) => a + x.adjustment, 0)),
  };
  const box11 = { box: "11", amount: box9.amount, vat: box9.vat, adjustment: box9.adjustment };
  const due = r2(box8.vat + box8.adjustment);
  const recoverable = r2(box11.vat + box11.adjustment);
  return {
    box1,
    box2: zero("2"), box3: zero("3"), box4: zero("4"), box5: zero("5"), box6: zero("6"), box7: zero("7"),
    box8,
    box9,
    box10: zero("10"),
    box11,
    box12: due,
    box13: recoverable,
    box14: r2(due - recoverable),
    // Things to check before filing
    purchasesNoVat: rep.purchases.filter((p) => n(p.vat) === 0).length,
    purchasesNoTrn: purchasesWithVat.filter((p) => !validTrn(p.supplier_trn)).length,
    purchasesInReview: rep.purchases.filter((p) => p.status === "review").length,
    expensesNoInvoice: rep.expenses.filter((e) => !e.has_tax_invoice && n(e.vat) > 0).length,
  };
}
