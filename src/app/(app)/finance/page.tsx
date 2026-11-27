import Link from "next/link";
import { requireManager } from "@/lib/session";
import { dubaiDate, fmtAED, fmtDate, fmtNum } from "@/lib/format";
import { localName } from "@/lib/i18n";
import { EXPENSE_CATEGORIES, profitAndLoss, validTrn, vat201, vatDueDate, vatPeriodOf } from "@/lib/finance";
import { DbUpdateNeeded } from "@/components/db-update";
import { Empty, PageHeader, Panel, StatusBadge } from "@/components/ui";
import SubmitButton from "@/components/submit-button";
import { loadFinance, type FinanceSearch } from "./data";
import { PnlTable, Vat201Table, vatChecks } from "./views";
import { addExpense, deleteExpense } from "./actions";

const TABS = ["summary", "vat", "sales", "costs"] as const;

export default async function FinancePage({ searchParams }: { searchParams: Promise<FinanceSearch> }) {
  const { supabase, t, locale } = await requireManager();
  const sp = await searchParams;
  const f = await loadFinance(supabase, sp);
  if (f.needsDb) return (<><PageHeader title={t.finance} back="/more" /><DbUpdateNeeded text={t.dbUpdateNeeded} /></>);
  const { settings, r, rep, appsWithoutCommission } = f;
  const tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? sp.tab! : "summary";
  const pl = profitAndLoss(rep);
  const v = vat201(rep, settings);
  const a = (x: number | string) => fmtAED(x, locale);
  const period = r.range === "custom" ? `from=${r.from}&to=${r.to}` : `range=${r.range}`;
  const qs = `from=${r.from}&to=${r.to}`;
  const here = `/finance?tab=${tab}&${period}`;

  // Is the chosen range exactly one VAT period? Then show its due date.
  const vp = vatPeriodOf(r.from, settings);
  const isVatPeriod = vp.from === r.from && (vp.to === r.to || ("periodEnd" in r && r.periodEnd === vp.to));
  const periodOpen = dubaiDate() < vp.to && isVatPeriod;

  const warnings: { text: string; href?: string; cta?: string }[] = [];
  if (!validTrn(settings.trn)) warnings.push({ text: t.trnMissing, href: "/settings#vat", cta: t.fixInSettings });
  if (appsWithoutCommission.length)
    warnings.push({ text: t.commissionMissing.replace("{names}", appsWithoutCommission.map((c) => localName(c, locale)).join(", ")), href: "/channels", cta: t.fixInChannels });
  if (pl.uncostedShare >= 1) warnings.push({ text: t.uncostedWarn.replace("{p}", pl.uncostedShare.toFixed(0)), href: "/menu", cta: t.menu });
  if (rep.pending_invoices) warnings.push({ text: t.pendingInvoicesWarn.replace("{n}", String(rep.pending_invoices)), href: "/invoices", cta: t.invoices });

  const presets: [string, string][] = [
    ["vat", t.fin_vat], ["last_vat", t.fin_last_vat], ["month", t.fin_month], ["last_month", t.fin_last_month], ["ytd", t.fin_ytd], ["last_year", t.fin_last_year],
  ];
  const tabLabels: Record<string, string> = { summary: t.tabSummary, vat: t.tabVat, sales: t.tabSales, costs: t.tabCosts };

  return (
    <>
      <PageHeader title={t.finance} back="/more" />
      <p className="mb-3 rounded-2xl bg-bean-50 p-3 text-xs text-bean-700">{t.finDisclaimer}</p>

      <div className="seg mb-2 overflow-x-auto">
        {presets.map(([k, label]) => (
          <Link key={k} href={`/finance?tab=${tab}&range=${k}`} className={`seg-item shrink-0 ${r.range === k ? "seg-on" : ""}`}>{label}</Link>
        ))}
      </div>
      <form className="mb-4 flex flex-wrap items-end gap-2">
        <input type="hidden" name="tab" value={tab} />
        <input type="date" name="from" defaultValue={r.from} className="input w-auto" />
        <input type="date" name="to" defaultValue={r.to} className="input w-auto" />
        <button className="btn-secondary">{t.show}</button>
      </form>

      {warnings.length > 0 && (
        <section className="card mb-4 border-2 border-amber-300 bg-amber-50 text-amber-900">
          <h2 className="eyebrow mb-2 text-amber-900">{t.warnings}</h2>
          <ul className="space-y-2 text-sm">
            {warnings.map((w) => (
              <li key={w.text}>
                {w.text}{" "}
                {w.href && <Link href={w.href} className="font-semibold underline">{w.cta}</Link>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="seg mb-4 overflow-x-auto">
        {TABS.map((k) => (
          <Link key={k} href={`/finance?tab=${k}&${period}`} className={`seg-item shrink-0 ${tab === k ? "seg-on" : ""}`}>{tabLabels[k]}</Link>
        ))}
      </div>

      {tab === "summary" && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
            <Kpi label={t.revenueNet} value={a(pl.revenue)} sub={`${t.salesInclVat} ${a(pl.salesGross)}`} />
            <Kpi label={t.grossMargin} value={pl.grossMargin == null ? "–" : `${pl.grossMargin.toFixed(1)}%`} sub={a(pl.grossProfit)} />
            <Kpi label={t.netProfit} value={a(pl.netProfit)} sub={pl.netMargin == null ? undefined : `${pl.netMargin.toFixed(1)}%`} bad={pl.netProfit < 0} />
            <Kpi label={v.box14 < 0 ? t.vatRefundable : t.vatPayable} value={a(Math.abs(v.box14))} sub={`${t.vatOnSales} ${a(v.box12)}`} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Panel title={t.plTitle} aside={`${fmtDate(r.from, locale)} – ${fmtDate(r.to, locale, { year: "numeric" })}`}>
              <PnlTable pl={pl} t={t} locale={locale} />
              <p className="muted mt-3 text-xs">{t.purchasesInfo}: <span className="num font-semibold">{a(pl.purchasesNet)}</span>. {t.purchasesInfoHint}</p>
            </Panel>
            <div className="space-y-4">
              <Panel title={t.ctTitle}>
                <ul className="list-disc space-y-1.5 ps-5 text-sm">
                  <li>{t.ct1}</li>
                  <li>{t.ct2}</li>
                </ul>
              </Panel>
              <Exports t={t} qs={qs} />
            </div>
          </div>
        </>
      )}

      {tab === "vat" && (
        <div className="grid gap-4 md:grid-cols-5">
          <Panel title={t.vat201Title} className="md:col-span-3" aside={settings.trn ? <span className="num">TRN {settings.trn}</span> : undefined}>
            <p className="mb-2 text-sm">
              {t.period}: <span className="num font-semibold">{r.from} – {r.to}</span>
            </p>
            {isVatPeriod && <p className="mb-1 text-sm font-semibold text-accent">{t.dueBy.replace("{d}", fmtDate(vatDueDate(vp.to), locale, { year: "numeric" }))}</p>}
            {periodOpen && <p className="muted mb-2 text-xs">{t.periodNotEnded}</p>}
            <Vat201Table v={v} t={t} locale={locale} />
          </Panel>
          <div className="space-y-4 md:col-span-2">
            <Panel title={t.checksTitle}>
              <ul className="list-disc space-y-1.5 ps-5 text-sm">
                {vatChecks(v, t).map((c) => <li key={c}>{c}</li>)}
              </ul>
            </Panel>
            <Exports t={t} qs={qs} />
            <Panel title={t.vatGuideTitle}>
              <ul className="list-disc space-y-1.5 ps-5 text-sm">
                {(["vg1", "vg2", "vg3", "vg4", "vg5", "vg6", "vg7", "vg8", "vg9"] as const).map((k) => <li key={k}>{t[k]}</li>)}
              </ul>
              <p className="muted mt-3 text-xs">
                {t.sources}:{" "}
                <a className="underline" href="https://tax.gov.ae/en/taxes/vat.aspx" target="_blank" rel="noreferrer">FTA VAT</a> ·{" "}
                <a className="underline" href="https://mof.gov.ae/en/news/ministry-of-finance-to-implement-vat-law-amendments-starting-january-2026/" target="_blank" rel="noreferrer">MoF 2026</a> ·{" "}
                <a className="underline" href="https://mof.gov.ae/en/news/ministry-of-finance-announces-the-issuance-of-two-ministerial-decisions-on-the-scope-of-obligations-and-the-timelines-for-implementing-the-electronic-invoicing-system-2/" target="_blank" rel="noreferrer">e-invoicing</a> ·{" "}
                <a className="underline" href="https://eservices.tax.gov.ae" target="_blank" rel="noreferrer">EmaraTax</a>
              </p>
            </Panel>
          </div>
        </div>
      )}

      {tab === "sales" && (
        <div className="grid gap-4 md:grid-cols-2">
          <Panel title={t.byChannel} className="md:col-span-2">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[30rem] text-sm">
                <thead className="text-xs text-bean-600">
                  <tr>
                    <th className="text-start">{t.channel}</th>
                    <th className="text-end">{t.orderCount}</th>
                    <th className="text-end">{t.grossCol}</th>
                    <th className="text-end">{t.vat}</th>
                    <th className="text-end">{t.netCol}</th>
                    <th className="text-end">{t.commission}</th>
                  </tr>
                </thead>
                <tbody>
                  {rep.by_channel.map((c) => (
                    <tr key={c.code} className="border-t border-bean-100">
                      <td className="py-1.5">{localName(c, locale)}{c.is_app && <span className="muted num text-xs"> · {fmtNum(c.commission_pct, locale)}%</span>}</td>
                      <td className="num text-end">{fmtNum(c.orders, locale)}</td>
                      <td className="num text-end">{a(c.gross)}</td>
                      <td className="num text-end">{a(c.vat)}</td>
                      <td className="num text-end">{a(Number(c.gross) - Number(c.vat))}</td>
                      <td className="num text-end">{a(c.commission)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-bean-300 font-bold">
                    <td className="py-1.5">{t.total}</td>
                    <td className="num text-end">{fmtNum(rep.by_channel.reduce((s, c) => s + Number(c.orders), 0), locale)}</td>
                    <td className="num text-end">{a(rep.by_channel.reduce((s, c) => s + Number(c.gross), 0))}</td>
                    <td className="num text-end">{a(rep.by_channel.reduce((s, c) => s + Number(c.vat), 0))}</td>
                    <td className="num text-end">{a(rep.by_channel.reduce((s, c) => s + Number(c.gross) - Number(c.vat), 0))}</td>
                    <td className="num text-end">{a(rep.commission)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {Number(rep.refunds.orders) > 0 && (
              <p className="muted mt-2 text-xs num">{t.refunds}: {rep.refunds.orders} · {a(rep.refunds.gross)}</p>
            )}
          </Panel>
          <Panel title={t.byPayment}>
            <p className="muted mb-2 text-xs">{t.paymentsHint}</p>
            <ul className="space-y-1 text-sm">
              {rep.by_method.map((m) => (
                <li key={m.method} className="flex justify-between">
                  <span>{t[`pay_${m.method}` as "pay_cash"] ?? m.method}</span>
                  <span className="num font-semibold">{a(m.amount)}</span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title={t.byMonth}>
            <table className="w-full text-sm">
              <thead className="text-xs text-bean-600">
                <tr><th className="text-start">{t.period}</th><th className="text-end">{t.netCol}</th><th className="text-end">{t.vat}</th><th className="text-end">{t.grossMargin}</th></tr>
              </thead>
              <tbody>
                {rep.by_month.map((m) => {
                  const net = Number(m.gross) - Number(m.vat);
                  return (
                    <tr key={m.month} className="border-t border-bean-100">
                      <td className="num py-1.5">{m.month}</td>
                      <td className="num text-end">{a(net)}</td>
                      <td className="num text-end">{a(m.vat)}</td>
                      <td className="num text-end">{net > 0 ? `${(((net - Number(m.cost)) / net) * 100).toFixed(0)}%` : "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
          <div className="md:col-span-2"><Exports t={t} qs={qs} /></div>
        </div>
      )}

      {tab === "costs" && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-4">
            <Panel title={t.addExpense}>
              {sp.added && <p className="mb-2 text-sm text-green-700">✓ {t.saved}</p>}
              <p className="muted mb-3 text-xs">{t.expenseHint}</p>
              <form action={addExpense} className="space-y-2">
                <input type="hidden" name="back" value={`/finance?tab=costs&${period}`} />
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-bean-600">{t.date}<input type="date" name="expense_date" defaultValue={dubaiDate() <= r.to ? dubaiDate() : r.to} className="input" /></label>
                  <label className="text-xs text-bean-600">{t.category}
                    <select name="category" className="input" defaultValue="rent">
                      {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{t[`cat_${c}`]}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-bean-600">{t.amountExVat}<input name="amount" required inputMode="decimal" className="input num" /></label>
                  <label className="text-xs text-bean-600">{t.vat}<input name="vat" inputMode="decimal" className="input num" placeholder="5%" /></label>
                  <label className="text-xs text-bean-600">{t.payee}<input name="payee" className="input" /></label>
                  <label className="text-xs text-bean-600">{t.payeeTrn}<input name="payee_trn" dir="ltr" inputMode="numeric" className="input num" /></label>
                  <label className="text-xs text-bean-600">{t.reference}<input name="reference" dir="ltr" className="input" /></label>
                  <label className="text-xs text-bean-600">{t.paidBy}
                    <select name="paid_by" className="input" defaultValue="bank">
                      {(["bank", "card", "cash", "other"] as const).map((m) => <option key={m} value={m}>{t[`paid_${m}`]}</option>)}
                    </select>
                  </label>
                </div>
                <input name="description" placeholder={t.notes} className="input" />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="has_tax_invoice" defaultChecked /> {t.hasTaxInvoice}</label>
                <p className="muted text-xs">{t.vatAuto}</p>
                <SubmitButton className="btn-primary w-full">{t.add}</SubmitButton>
              </form>
            </Panel>
            <Exports t={t} qs={qs} />
          </div>
          <div className="space-y-4">
            <Panel title={t.expensesTitle} aside={<span className="num">{a(rep.expenses.reduce((s, e) => s + Number(e.amount), 0))}</span>}>
              {rep.expenses.length ? (
                <ul className="divide-y divide-bean-100 text-sm">
                  {[...rep.expenses].reverse().map((e) => (
                    <li key={e.id} className="flex items-start justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <div className="font-medium">{t[`cat_${e.category}`]}{e.payee && <span className="text-bean-600"> · {e.payee}</span>}</div>
                        <div className="muted num text-xs">
                          {e.expense_date}{e.reference && ` · ${e.reference}`}{e.description && ` · ${e.description}`}
                          {!e.has_tax_invoice && Number(e.vat) > 0 && " · ⚠"}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <div className="text-end">
                          <div className="num font-semibold">{a(e.amount)}</div>
                          {Number(e.vat) > 0 && <div className="muted num text-xs">+ {t.vat} {a(e.vat)}</div>}
                        </div>
                        <form action={deleteExpense}>
                          <input type="hidden" name="id" value={e.id} />
                          <input type="hidden" name="back" value={here} />
                          <SubmitButton className="icon-btn h-8 w-8 text-red-700" confirmText={t.deleteExpenseConfirm}>×</SubmitButton>
                        </form>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>{t.noExpenses}</Empty>
              )}
            </Panel>
            <Panel title={t.purchasesTitle} aside={<span className="num">{a(pl.purchasesNet)}</span>}>
              {rep.purchases.length ? (
                <ul className="divide-y divide-bean-100 text-sm">
                  {rep.purchases.map((p) => (
                    <li key={p.id}>
                      <Link href={`/invoices/${p.id}`} className="flex items-start justify-between gap-2 py-2">
                        <div className="min-w-0">
                          <div className="truncate font-medium">{p.supplier ?? "…"}</div>
                          <div className="muted num text-xs">
                            {p.date}{p.invoice_number && ` · ${p.invoice_number}`}
                            {Number(p.vat) > 0 && !validTrn(p.supplier_trn) && ` · ${t.supplierTrn} ⚠`}
                          </div>
                        </div>
                        <div className="shrink-0 text-end">
                          <div className="num font-semibold">{a(p.net)}</div>
                          <div className="muted num text-xs">{t.vat} {a(p.vat)}</div>
                          {p.status === "review" && <StatusBadge status="review" label={t.status_review} />}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>{t.noPurchases}</Empty>
              )}
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}

function Kpi({ label, value, sub, bad }: { label: string; value: string; sub?: string; bad?: boolean }) {
  return (
    <div className="card p-3">
      <div className="eyebrow">{label}</div>
      <div className={`num mt-1 text-xl font-extrabold tracking-tight ${bad ? "text-red-700" : ""}`}>{value}</div>
      {sub && <div className="muted num text-xs">{sub}</div>}
    </div>
  );
}

function Exports({ t, qs }: { t: import("@/lib/i18n").Dict; qs: string }) {
  const kinds = [["vat", t.csvVat], ["pl", t.csvPl], ["sales", t.csvSales], ["purchases", t.csvPurchases], ["expenses", t.csvExpenses]] as const;
  return (
    <Panel title={t.exportTitle}>
      <a href={`/finance/print?${qs}`} target="_blank" className="btn-primary mb-2 w-full">⬇ {t.pdfReport}</a>
      <div className="grid grid-cols-2 gap-2">
        {kinds.map(([k, label]) => (
          <a key={k} href={`/api/finance/export?${qs}&kind=${k}`} className="btn-secondary btn-sm">⬇ {label} (CSV)</a>
        ))}
      </div>
    </Panel>
  );
}
