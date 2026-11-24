import Link from "next/link";
import { requireManager } from "@/lib/session";
import { fmtAED, fmtNum } from "@/lib/format";
import { localName } from "@/lib/i18n";
import { missingTable } from "@/lib/pos";
import { profit, reportRange, type Report } from "@/lib/reports";
import { DbUpdateNeeded } from "@/components/db-update";
import { PageHeader, Panel } from "@/components/ui";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const { supabase, t, locale } = await requireManager();
  const r = reportRange(await searchParams);
  const { data, error } = await supabase.rpc("sales_report", { p_from: r.from, p_to: r.to });
  if (missingTable(error)) return <DbUpdateNeeded text={t.dbUpdateNeeded} />;
  if (error) return <p className="card text-red-700">{error.message}</p>;
  const rep = data as Report;
  const tot = rep.totals;
  const net = Number(tot.sales) - Number(tot.vat);
  const foodPct = net > 0 ? (Number(tot.cost) / net) * 100 : null;
  const maxHour = Math.max(1, ...rep.by_hour.map((h) => Number(h.sales)));
  const presets = [
    ["today", t.today],
    ["yesterday", t.yesterday],
    ["7d", t.last7days],
    ["month", t.thisMonth],
    ["30d", t.last30days],
  ];
  const qs = `from=${r.from}&to=${r.to}`;

  return (
    <>
      <PageHeader title={t.reports} back="/more" />
      <div className="seg mb-3 overflow-x-auto">
        {presets.map(([k, label]) => (
          <Link key={k} href={`/reports?range=${k}`} className={`seg-item shrink-0 ${r.range === k ? "seg-on" : ""}`}>
            {label}
          </Link>
        ))}
      </div>
      <form className="mb-4 flex flex-wrap items-end gap-2">
        <input type="date" name="from" defaultValue={r.from} className="input w-auto" />
        <input type="date" name="to" defaultValue={r.to} className="input w-auto" />
        <button className="btn-secondary">{t.show}</button>
        <a href={`/api/reports/export?${qs}&kind=items`} className="btn-secondary">⬇ {t.exportItems}</a>
        <a href={`/api/reports/export?${qs}&kind=orders`} className="btn-secondary">⬇ {t.exportOrders}</a>
      </form>

      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Kpi label={t.sales} value={fmtAED(tot.sales, locale)} sub={`${fmtNum(tot.orders, locale)} ${t.ordersWord}`} />
        <Kpi label={t.avgTicket} value={tot.orders ? fmtAED(Number(tot.sales) / Number(tot.orders), locale) : "–"} />
        <Kpi label={t.foodCost} value={foodPct != null ? `${foodPct.toFixed(1)}%` : "–"} sub={fmtAED(tot.cost, locale)} />
        <Kpi label={t.profitAfterCosts} value={fmtAED(profit(tot), locale)} sub={`${t.commission} ${fmtAED(tot.commission, locale)}`} />
      </div>
      <p className="muted mb-4 num">
        {t.vatCollected} {fmtAED(tot.vat, locale)}
        {Number(rep.refunds.orders) > 0 && <> · {t.refunds} {rep.refunds.orders} ({fmtAED(rep.refunds.amount, locale)})</>}
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title={t.byChannel}>
          <table className="w-full text-sm">
            <thead className="text-xs text-bean-600">
              <tr><th className="text-start">{t.channel}</th><th className="text-end">{t.sales}</th><th className="text-end">{t.profitAfterCosts}</th></tr>
            </thead>
            <tbody>
              {rep.by_channel.map((c) => (
                <tr key={c.code} className="border-t border-bean-100">
                  <td className="py-1.5">{localName(c, locale)} <span className="muted num text-xs">({c.orders})</span></td>
                  <td className="num text-end">{fmtAED(c.sales, locale)}</td>
                  <td className="num text-end">{fmtAED(profit(c), locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title={t.byPayment}>
          <ul className="space-y-1 text-sm">
            {rep.by_method.map((m) => (
              <li key={m.method} className="flex justify-between">
                <span>{t[`pay_${m.method}` as "pay_cash"]}</span>
                <span className="num font-semibold">{fmtAED(m.amount, locale)}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title={t.byHour} className="md:col-span-2">
          <div className="flex h-32 items-stretch gap-1" dir="ltr">
            {Array.from({ length: 24 }, (_, h) => rep.by_hour.find((x) => x.hour === h)).map((x, h) => (
              <div key={h} className="flex flex-1 flex-col items-center gap-1" title={x ? `${h}:00 · ${fmtAED(x.sales, locale)} · ${x.orders}` : `${h}:00`}>
                <div className="flex w-full flex-1 items-end">
                  <div className="w-full rounded-t bg-accent" style={{ height: `${x ? Math.max(4, (Number(x.sales) / maxHour) * 100) : 0}%` }} />
                </div>
                <span className="num text-[9px] text-bean-500">{h % 3 === 0 ? h : ""}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title={t.byItem} className="md:col-span-2">
          <table className="w-full text-sm">
            <thead className="text-xs text-bean-600">
              <tr><th className="text-start">{t.item}</th><th className="text-end">{t.qty}</th><th className="text-end">{t.sales}</th><th className="text-end">{t.foodCost}</th></tr>
            </thead>
            <tbody>
              {rep.by_item.map((i) => {
                const pct = Number(i.sales) > 0 ? (Number(i.cost) / (Number(i.sales) / 1.05)) * 100 : null;
                return (
                  <tr key={i.id} className="border-t border-bean-100">
                    <td className="py-1.5">{localName(i, locale)}</td>
                    <td className="num text-end">{i.qty}</td>
                    <td className="num text-end">{fmtAED(i.sales, locale)}</td>
                    <td className={`num text-end ${pct != null && pct > 35 ? "font-bold text-red-700" : ""}`}>{pct != null && Number(i.cost) > 0 ? `${pct.toFixed(0)}%` : "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>

        <Panel title={t.byStaff}>
          <ul className="space-y-1 text-sm">
            {rep.by_staff.map((s) => (
              <li key={s.staff_id ?? "x"} className="flex justify-between">
                <span>{s.name} <span className="muted num text-xs">({s.orders})</span></span>
                <span className="num font-semibold">{fmtAED(s.sales, locale)}</span>
              </li>
            ))}
          </ul>
        </Panel>

        {rep.by_day.length > 1 && (
          <Panel title={t.byDay}>
            <ul className="space-y-1 text-sm">
              {rep.by_day.map((d) => (
                <li key={d.day} className="flex justify-between">
                  <span className="num">{d.day}</span>
                  <span className="num font-semibold">{fmtAED(d.sales, locale)} <span className="muted text-xs">({d.orders})</span></span>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-3">
      <div className="eyebrow">{label}</div>
      <div className="num mt-1 text-xl font-extrabold tracking-tight">{value}</div>
      {sub && <div className="muted num text-xs">{sub}</div>}
    </div>
  );
}
