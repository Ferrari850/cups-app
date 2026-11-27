import { fmtAED, type Locale } from "@/lib/format";
import type { Dict } from "@/lib/i18n";
import { profitAndLoss, vat201 } from "@/lib/finance";

type PL = ReturnType<typeof profitAndLoss>;
type V201 = ReturnType<typeof vat201>;

function Line({ label, value, strong, sub, negative }: { label: React.ReactNode; value: string; strong?: boolean; sub?: boolean; negative?: boolean }) {
  return (
    <tr className={`border-t border-bean-100 ${strong ? "font-bold" : ""}`}>
      <td className={`py-1.5 ${sub ? "ps-4 text-bean-600" : ""}`}>{label}</td>
      <td className={`num py-1.5 text-end ${negative ? "text-bean-600" : ""}`}>{value}</td>
    </tr>
  );
}

/** Profit and loss statement, AED excluding VAT. */
export function PnlTable({ pl, t, locale }: { pl: PL; t: Dict; locale: Locale }) {
  const a = (v: number) => fmtAED(v, locale);
  const neg = (v: number) => (v ? `(${fmtAED(v, locale)})` : fmtAED(0, locale));
  const pct = (v: number | null) => (v == null ? "–" : `${v.toFixed(1)}%`);
  return (
    <table className="w-full text-sm">
      <tbody>
        <Line label={t.salesExVat} value={a(pl.salesNet)} />
        {pl.refundsNet > 0 && <Line label={t.refundsLess} value={neg(pl.refundsNet)} sub negative />}
        <Line label={t.revenueNet} value={a(pl.revenue)} strong />
        <Line label={t.cogsLabel} value={neg(pl.cogs)} sub negative />
        <Line label={t.grossProfit} value={a(pl.grossProfit)} strong />
        <Line label={t.grossMargin} value={pct(pl.grossMargin)} sub />
        <tr><td colSpan={2} className="eyebrow pt-4 pb-1">{t.operatingExpenses}</td></tr>
        <Line label={<>{t.platformFees}{pl.platformIsEstimate && <span className="muted text-xs"> ({t.estimated})</span>}</>} value={neg(pl.platform)} sub negative />
        {pl.waste > 0 && <Line label={t.wasteLabel} value={neg(pl.waste)} sub negative />}
        {pl.opex.map((o) => (
          <Line key={o.category} label={t[`cat_${o.category}`]} value={neg(o.amount)} sub negative />
        ))}
        <Line label={t.totalExpenses} value={neg(pl.opexTotal)} />
        <tr className="border-t-2 border-bean-300 text-base font-extrabold">
          <td className="py-2">{t.netProfit}</td>
          <td className={`num py-2 text-end ${pl.netProfit < 0 ? "text-red-700" : ""}`}>{a(pl.netProfit)}</td>
        </tr>
        <Line label={t.netMargin} value={pct(pl.netMargin)} sub />
      </tbody>
    </table>
  );
}

/** The VAT 201 return in the FTA's box layout. Narrow enough for a phone: box, label, amount, VAT. */
export function Vat201Table({ v, t, locale }: { v: V201; t: Dict; locale: Locale }) {
  const nf = new Intl.NumberFormat(locale === "ar" ? "ar-AE-u-nu-latn" : "en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const a = (x: number) => nf.format(x);
  const Row = ({ box, label, amount, vat, strong }: { box: string; label: string; amount?: number; vat?: number; strong?: boolean }) => (
    <tr className={`border-t border-bean-100 align-top ${strong ? "font-bold" : ""}`}>
      <td className="num w-7 py-1.5 pe-1 text-xs text-bean-500">{box}</td>
      <td className="py-1.5 pe-2">{label}</td>
      <td className="num py-1.5 text-end whitespace-nowrap">{amount == null ? "" : a(amount)}</td>
      <td className="num py-1.5 ps-3 text-end whitespace-nowrap">{vat == null ? "" : a(vat)}</td>
    </tr>
  );
  const Head = ({ title }: { title: string }) => (
    <tr>
      <th colSpan={2} className="eyebrow pt-3 pb-1 text-start">{title}</th>
      <th className="pt-3 pb-1 text-end text-xs font-semibold text-bean-600">{t.colAmount}</th>
      <th className="pt-3 pb-1 ps-3 text-end text-xs font-semibold text-bean-600">{t.colVat}</th>
    </tr>
  );
  return (
    <div>
      <table className="w-full text-sm">
        <tbody>
          <Head title={`${t.vatOnSales} (AED)`} />
          {v.box1.map((b) => (
            <Row key={b.box} box={b.box} label={t.vatBox1.replace("{e}", t[`em_${b.emirate}`])} amount={b.amount} vat={b.vat} />
          ))}
          {([2, 3, 4, 5, 6, 7] as const).map((k) => {
            const b = v[`box${k}`];
            return <Row key={k} box={String(k)} label={t[`vatBox${k}`]} amount={b.amount} vat={k === 4 || k === 5 ? undefined : b.vat} />;
          })}
          <Row box="8" label={t.vatBox8} amount={v.box8.amount} vat={v.box8.vat} strong />
          <Head title={`${t.vatOnPurchases} (AED)`} />
          <Row box="9" label={t.vatBox9} amount={v.box9.amount} vat={v.box9.vat} />
          <Row box="10" label={t.vatBox10} amount={v.box10.amount} vat={v.box10.vat} />
          <Row box="11" label={t.vatBox11} amount={v.box11.amount} vat={v.box11.vat} strong />
          <tr><td colSpan={4} className="pt-4" /></tr>
          <Row box="12" label={t.vatBox12} vat={v.box12} />
          <Row box="13" label={t.vatBox13} vat={v.box13} />
          <tr className="border-t-2 border-bean-300 align-top text-base font-extrabold">
            <td className="num py-2 pe-1 text-xs text-bean-500">14</td>
            <td colSpan={2} className="py-2">{t.vatBox14}</td>
            <td className={`num py-2 ps-3 text-end whitespace-nowrap ${v.box14 < 0 ? "text-green-700" : ""}`}>{a(v.box14)}</td>
          </tr>
        </tbody>
      </table>
      <p className="muted mt-2 text-xs">{t.adjZero}</p>
      {v.box14 < 0 && <p className="muted mt-1 text-xs">{t.vatNegative}</p>}
    </div>
  );
}

/** Things the owner should check before filing, as plain sentences. */
export function vatChecks(v: V201, t: Dict) {
  const list: string[] = [];
  if (v.purchasesInReview) list.push(t.reviewInvoicesWarn.replace("{n}", String(v.purchasesInReview)));
  if (v.purchasesNoTrn) list.push(t.chkNoTrnSupplier.replace("{n}", String(v.purchasesNoTrn)));
  if (v.purchasesNoVat) list.push(t.chkNoVat.replace("{n}", String(v.purchasesNoVat)));
  if (v.expensesNoInvoice) list.push(t.chkExpNoInvoice.replace("{n}", String(v.expensesNoInvoice)));
  list.push(t.chkRefunds, t.chkReverseCharge);
  return list;
}
