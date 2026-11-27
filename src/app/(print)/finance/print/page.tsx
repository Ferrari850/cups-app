import Link from "next/link";
import { requireManager } from "@/lib/session";
import { dubaiDate, fmtAED, fmtDate } from "@/lib/format";
import { localName } from "@/lib/i18n";
import { profitAndLoss, vat201 } from "@/lib/finance";
import PrintButton from "@/app/(pos)/receipt/[id]/print-button";
import { DbUpdateNeeded } from "@/components/db-update";
import { loadFinance, type FinanceSearch } from "@/app/(app)/finance/data";
import { PnlTable, Vat201Table, vatChecks } from "@/app/(app)/finance/views";

/** One printable report for a period: P&L, VAT 201, sales by channel, purchases and expenses. Save as PDF from the print dialog. */
export default async function FinancePrint({ searchParams }: { searchParams: Promise<FinanceSearch> }) {
  const { supabase, t, locale } = await requireManager();
  const sp = await searchParams;
  const f = await loadFinance(supabase, sp);
  if (f.needsDb) return <DbUpdateNeeded text={t.dbUpdateNeeded} />;
  const { settings, r, rep } = f;
  const pl = profitAndLoss(rep);
  const v = vat201(rep, settings);
  const a = (x: number | string) => fmtAED(x, locale);
  const name = settings.legal_name || (locale === "ar" && settings.name_ar ? settings.name_ar : settings.name);
  const address = locale === "ar" && settings.address_ar ? settings.address_ar : settings.address;

  return (
    <main className="mx-auto max-w-3xl bg-surface p-6 text-bean-900 print:max-w-none print:p-0">
      <div className="mb-4 flex gap-2 print:hidden">
        <Link href={`/finance?from=${r.from}&to=${r.to}`} className="btn-secondary">{t.back}</Link>
        <div className="flex-1"><PrintButton label={t.pdfReport} /></div>
      </div>

      <header className="mb-5 border-b-2 border-bean-300 pb-3">
        <h1 className="text-2xl font-extrabold">{name}</h1>
        {address && <p className="text-sm">{address}</p>}
        <p className="num text-sm">TRN: {settings.trn || "—"}</p>
        <p className="mt-2 text-lg font-bold">{t.finance} · <span className="num">{r.from} – {r.to}</span></p>
        <p className="muted text-xs">{t.preparedOn.replace("{d}", fmtDate(dubaiDate(), locale, { year: "numeric" }))} · AED</p>
      </header>

      <Section title={t.plTitle}><PnlTable pl={pl} t={t} locale={locale} /></Section>

      <Section title={t.vat201Title}>
        <Vat201Table v={v} t={t} locale={locale} />
        <ul className="mt-3 list-disc space-y-1 ps-5 text-xs">
          {vatChecks(v, t).map((c) => <li key={c}>{c}</li>)}
        </ul>
      </Section>

      <Section title={t.byChannel}>
        <table className="w-full text-sm">
          <thead className="text-xs text-bean-600">
            <tr><th className="text-start">{t.channel}</th><th className="text-end">{t.orderCount}</th><th className="text-end">{t.grossCol}</th><th className="text-end">{t.vat}</th><th className="text-end">{t.commission}</th></tr>
          </thead>
          <tbody>
            {rep.by_channel.map((c) => (
              <tr key={c.code} className="border-t border-bean-100">
                <td className="py-1">{localName(c, locale)}</td>
                <td className="num text-end">{c.orders}</td>
                <td className="num text-end">{a(c.gross)}</td>
                <td className="num text-end">{a(c.vat)}</td>
                <td className="num text-end">{a(c.commission)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs">
          {t.byPayment}: {rep.by_method.map((m) => `${t[`pay_${m.method}` as "pay_cash"] ?? m.method} ${a(m.amount)}`).join(" · ")}
        </p>
      </Section>

      <Section title={t.purchasesTitle}>
        <table className="w-full text-xs">
          <thead className="text-bean-600">
            <tr><th className="text-start">{t.date}</th><th className="text-start">{t.supplier}</th><th className="text-start">{t.supplierTrn}</th><th className="text-start">{t.reference}</th><th className="text-end">{t.netCol}</th><th className="text-end">{t.vat}</th><th className="text-end">{t.total}</th></tr>
          </thead>
          <tbody>
            {rep.purchases.map((p) => (
              <tr key={p.id} className="border-t border-bean-100">
                <td className="num py-1">{p.date}</td><td>{p.supplier}</td><td className="num">{p.supplier_trn ?? ""}</td><td className="num">{p.invoice_number ?? ""}</td>
                <td className="num text-end">{a(p.net)}</td><td className="num text-end">{a(p.vat)}</td><td className="num text-end">{a(p.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={t.expensesTitle}>
        <table className="w-full text-xs">
          <thead className="text-bean-600">
            <tr><th className="text-start">{t.date}</th><th className="text-start">{t.category}</th><th className="text-start">{t.payee}</th><th className="text-start">{t.payeeTrn}</th><th className="text-end">{t.netCol}</th><th className="text-end">{t.vat}</th></tr>
          </thead>
          <tbody>
            {rep.expenses.map((e) => (
              <tr key={e.id} className="border-t border-bean-100">
                <td className="num py-1">{e.expense_date}</td><td>{t[`cat_${e.category}`]}</td><td>{e.payee ?? ""}</td><td className="num">{e.payee_trn ?? ""}</td>
                <td className="num text-end">{a(e.amount)}</td><td className="num text-end">{e.has_tax_invoice ? a(e.vat) : `(${a(e.vat)})`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <p className="mt-6 border-t border-bean-200 pt-3 text-xs text-bean-600">{t.finDisclaimer}</p>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 break-inside-avoid-page">
      <h2 className="mb-2 text-base font-bold">{title}</h2>
      {children}
    </section>
  );
}
