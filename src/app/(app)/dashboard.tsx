import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, dubaiDate, fmtAED, fmtDate, fmtNum, fmtTime } from "@/lib/format";
import { localName, type Dict } from "@/lib/i18n";
import type { Locale } from "@/lib/format";
import { costPct } from "@/lib/costing";
import { profit, type Report } from "@/lib/reports";
import { Empty, Panel } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";

type Range = "today" | "7d" | "month";

/** The period shown and the one it is compared with. */
function periods(range: Range) {
  const today = dubaiDate();
  if (range === "7d") return { from: addDays(today, -6), to: today, pFrom: addDays(today, -13), pTo: addDays(today, -7) };
  if (range === "month") {
    const from = today.slice(0, 8) + "01";
    const days = Math.round((Date.parse(today) - Date.parse(from)) / 864e5);
    const d = new Date(from + "T00:00:00Z");
    d.setUTCMonth(d.getUTCMonth() - 1);
    const pFrom = d.toISOString().slice(0, 10);
    return { from, to: today, pFrom, pTo: addDays(pFrom, days) };
  }
  // Today against the same weekday last week, which is a fairer match for a cafe than yesterday.
  return { from: today, to: today, pFrom: addDays(today, -7), pTo: addDays(today, -7) };
}

type Alert = { href: string; icon: IconName; n: number; text: string; detail?: string; level: "red" | "amber"; noCount?: boolean };

export default async function ManagerDashboard({
  supabase,
  t,
  locale,
  range,
}: {
  supabase: SupabaseClient;
  t: Dict;
  locale: Locale;
  range: Range;
}) {
  const p = periods(range);
  const today = dubaiDate();
  const nowIso = new Date().toISOString();
  const dayStart = new Date(`${today}T00:00:00+04:00`).toISOString();
  const dayEnd = new Date(`${addDays(today, 1)}T00:00:00+04:00`).toISOString();
  const weekEnd = new Date(Date.now() + 7 * 864e5).toISOString();

  const [cur, prev, trend, swaps, invoices, priceAlerts, stockItems, stock, menu, costs, settings, register, live, shifts, events] =
    await Promise.all([
      supabase.rpc("sales_report", { p_from: p.from, p_to: p.to }),
      supabase.rpc("sales_report", { p_from: p.pFrom, p_to: p.pTo }),
      supabase.rpc("sales_report", { p_from: addDays(today, -13), p_to: today }),
      supabase.from("swap_requests").select("id", { count: "exact", head: true }).eq("status", "pending_manager"),
      supabase.from("invoices").select("id", { count: "exact", head: true }).eq("status", "review"),
      supabase
        .from("price_alerts")
        .select("id, change_pct, items(name, name_ar)", { count: "exact" })
        .is("dismissed_at", null)
        .order("created_at", { ascending: false })
        .limit(3),
      supabase.from("items").select("id, name, name_ar, min_stock, track_stock, unit_cost"),
      supabase.from("item_stock").select("item_id, on_hand"),
      supabase.from("menu_items").select("id, name, name_ar, selling_price, sold_out, active, image_url"),
      supabase.from("menu_item_costs").select("menu_item_id, portion_cost, ingredient_count, missing_prices"),
      supabase.from("cafe_settings").select("trn, address, margin_alert_pct").maybeSingle(),
      supabase.from("registers").select("opened_at, opening_cash").is("closed_at", null).maybeSingle(),
      supabase.from("orders").select("status").eq("business_date", today).in("status", ["incoming", "preparing", "ready"]),
      supabase
        .from("shifts")
        .select("id, starts_at, ends_at, station, profiles(full_name)")
        .lt("starts_at", dayEnd)
        .gt("ends_at", dayStart)
        .order("starts_at"),
      supabase.from("events").select("id, title, starts_at, guests").gte("starts_at", nowIso).lt("starts_at", weekEnd).order("starts_at").limit(4),
    ]);

  const rep = (cur.data ?? null) as Report | null;
  const old = (prev.data ?? null) as Report | null;
  const tr = (trend.data ?? null) as Report | null;

  // --- Figures -------------------------------------------------------------
  const k = (r: Report | null) => {
    const s = Number(r?.totals.sales ?? 0);
    const n = Number(r?.totals.orders ?? 0);
    const net = s - Number(r?.totals.vat ?? 0);
    return {
      sales: s,
      orders: n,
      avg: n ? s / n : 0,
      profit: r ? profit(r.totals) : 0,
      food: net > 0 ? (Number(r!.totals.cost) / net) * 100 : null,
    };
  };
  const a = k(rep);
  const b = k(old);
  const delta = (x: number, y: number) => (y > 0 ? ((x - y) / y) * 100 : null);
  const fmtD = (d: string) => fmtDate(d + "T12:00:00+04:00", locale, { weekday: range === "today" ? "long" : undefined });
  const cmpLabel = `${t.comparedWith} ${p.pFrom === p.pTo ? fmtD(p.pFrom) : `${fmtD(p.pFrom)} – ${fmtD(p.pTo)}`}`;

  // --- Things that need attention -----------------------------------------
  const onHand = new Map((stock.data ?? []).map((s) => [s.item_id, Number(s.on_hand)]));
  const low = (stockItems.data ?? []).filter((i) => i.track_stock && i.min_stock != null && (onHand.get(i.id) ?? 0) <= Number(i.min_stock));
  const unpricedIngredients = (stockItems.data ?? []).filter((i) => i.unit_cost == null).length;
  const costBy = new Map((costs.data ?? []).map((c) => [c.menu_item_id, c]));
  const activeMenu = (menu.data ?? []).filter((m) => m.active);
  const noPrice = activeMenu.filter((m) => m.selling_price == null);
  const noRecipe = activeMenu.filter((m) => !Number(costBy.get(m.id)?.ingredient_count ?? 0));
  const limit = Number(settings.data?.margin_alert_pct ?? 35);
  const costly = activeMenu
    .map((m) => {
      const c = costBy.get(m.id);
      const pct = c && Number(c.ingredient_count) && !Number(c.missing_prices) ? costPct(Number(c.portion_cost), m.selling_price == null ? null : Number(m.selling_price)) : null;
      return { m, pct };
    })
    .filter((x) => x.pct != null && x.pct > limit)
    .sort((x, y) => y.pct! - x.pct!);
  const soldOut = activeMenu.filter((m) => m.sold_out);
  const noPhoto = activeMenu.filter((m) => !m.image_url);
  const names = (rows: { name: string; name_ar?: string | null }[], n = 3) =>
    rows.slice(0, n).map((r) => localName(r, locale)).join(", ") + (rows.length > n ? "…" : "");

  type PriceAlertRow = { id: string; change_pct: number; items: { name: string; name_ar: string | null } | null };
  const pa = (priceAlerts.data ?? []) as unknown as PriceAlertRow[];

  const alerts: Alert[] = [
    { href: "/swaps", icon: "swap", n: swaps.count ?? 0, text: t.pendingSwaps, level: "amber" },
    { href: "/invoices", icon: "receipt", n: invoices.count ?? 0, text: t.invoicesToReview, level: "amber" },
    {
      href: "/alerts",
      icon: "alert",
      n: priceAlerts.count ?? 0,
      text: t.newPriceAlerts,
      detail: pa.map((x) => `${x.items ? localName(x.items, locale) : "?"} ${Number(x.change_pct) > 0 ? "+" : ""}${Number(x.change_pct)}%`).join(", "),
      level: "red",
    },
    { href: "/stock", icon: "box", n: low.length, text: t.alertLowStock, detail: names(low), level: "red" },
    { href: "/prices", icon: "chart", n: costly.length, text: `${t.alertHighCost} ${limit}%`, detail: names(costly.map((x) => x.m)), level: "red" },
    { href: "/prices", icon: "tag", n: noPrice.length, text: t.alertNoPrice, detail: names(noPrice), level: "red" },
    { href: "/menu", icon: "cup", n: soldOut.length, text: t.alertSoldOut, detail: names(soldOut), level: "amber" },
    { href: "/menu", icon: "cup", n: noRecipe.length, text: t.alertNoRecipe, level: "amber" },
    { href: "/items", icon: "tag", n: unpricedIngredients, text: t.alertIngredientNoPrice, level: "amber" },
    { href: "/menu/photos", icon: "camera", n: noPhoto.length, text: t.alertNoPhoto, detail: names(noPhoto), level: "amber" },
    {
      href: "/settings",
      icon: "gear",
      n: settings.data && (!settings.data.trn || !settings.data.address) ? 1 : 0,
      text: t.alertReceiptDetails,
      level: "amber",
      noCount: true,
    },
  ].filter((x) => x.n > 0) as Alert[];
  alerts.sort((x, y) => (x.level === y.level ? 0 : x.level === "red" ? -1 : 1));

  // --- Charts --------------------------------------------------------------
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  const byDay = new Map((tr?.by_day ?? []).map((d) => [String(d.day).slice(0, 10), Number(d.sales)]));
  const maxDay = Math.max(1, ...days.map((d) => byDay.get(d) ?? 0));
  const hours = rep?.by_hour ?? [];
  const firstH = Math.min(7, ...hours.map((h) => h.hour));
  const lastH = Math.max(23, ...hours.map((h) => h.hour));
  const hourRange = Array.from({ length: lastH - firstH + 1 }, (_, i) => firstH + i);
  const byHour = new Map(hours.map((h) => [h.hour, Number(h.sales)]));
  const maxHour = Math.max(1, ...hourRange.map((h) => byHour.get(h) ?? 0));
  const channels = rep?.by_channel ?? [];
  const top = (rep?.by_item ?? []).slice(0, 5);
  const maxTop = Math.max(1, ...top.map((i) => Number(i.sales)));
  const payTotal = (rep?.by_method ?? []).reduce((s, m) => s + Number(m.amount), 0);

  const liveCounts = { incoming: 0, preparing: 0, ready: 0 } as Record<string, number>;
  for (const o of live.data ?? []) liveCounts[o.status] = (liveCounts[o.status] ?? 0) + 1;
  type ShiftRow = { id: string; starts_at: string; ends_at: string; station: string | null; profiles: { full_name: string } | null };
  const onShift = (shifts.data ?? []) as unknown as ShiftRow[];
  const now = Date.now();

  const ranges: [Range, string][] = [
    ["today", t.today],
    ["7d", t.last7days],
    ["month", t.thisMonth],
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <div className="seg w-full sm:w-auto">
          {ranges.map(([r, label]) => (
            <Link key={r} href={r === "today" ? "/" : `/?range=${r}`} className={`seg-item flex-1 text-center sm:flex-none ${range === r ? "seg-on" : ""}`}>
              {label}
            </Link>
          ))}
        </div>
        <p className="text-xs text-bean-600">▲▼ {cmpLabel}</p>
      </div>

      {/* Headline figures */}
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Kpi className="col-span-2 md:col-span-4" label={t.sales} value={fmtAED(a.sales, locale)} d={delta(a.sales, b.sales)} cmp={cmpLabel} big />
        <Kpi label={t.orders} value={fmtNum(a.orders, locale, 0)} d={delta(a.orders, b.orders)} cmp={cmpLabel} />
        <Kpi label={t.avgTicket} value={a.orders ? fmtAED(a.avg, locale) : "–"} d={delta(a.avg, b.avg)} cmp={cmpLabel} />
        <Kpi label={t.profitAfterCosts} value={fmtAED(a.profit, locale, Math.abs(a.profit) >= 1000 ? 0 : 2)} d={delta(a.profit, b.profit)} cmp={cmpLabel} />
        <Kpi
          label={t.foodCost}
          value={a.food != null ? `${a.food.toFixed(1)}%` : "–"}
          d={a.food != null && b.food != null ? a.food - b.food : null}
          cmp={cmpLabel}
          points
          lowerIsBetter
          tone={a.food == null ? "" : a.food > limit ? "text-red-700" : a.food > limit - 10 ? "text-amber-700" : "text-green-700"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Alerts */}
        <Panel title={t.needsAttention} className="lg:col-span-1 lg:row-span-2" aside={alerts.length ? <span className="num">{alerts.length}</span> : undefined}>
          {alerts.length ? (
            <ul className="space-y-1.5">
              {alerts.map((x) => (
                <li key={x.text}>
                  <Link
                    href={x.href}
                    className={`flex items-start gap-3 rounded-2xl px-3 py-2.5 transition active:scale-[.99] ${
                      x.level === "red" ? "bg-red-50 hover:bg-red-100" : "bg-amber-50 hover:bg-amber-100"
                    }`}
                  >
                    <span
                      className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white ${
                        x.level === "red" ? "bg-red-700" : "bg-amber-700"
                      }`}
                    >
                      <Icon name={x.icon} className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm leading-snug font-semibold">
                        {!x.noCount && <span className="num">{x.n} </span>}{x.text}
                      </span>
                      {x.detail && <span className="block truncate text-xs text-bean-600">{x.detail}</span>}
                    </span>
                    <Icon name="chevron" className="mt-2 h-4 w-4 shrink-0 text-bean-400 rtl:rotate-180" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-2 rounded-2xl bg-green-50 px-3 py-3 text-sm font-semibold text-green-800">
              <span className="h-2 w-2 rounded-full bg-green-700" /> {t.nothingNeedsYou}
            </p>
          )}
        </Panel>

        {/* Right now */}
        <Panel title={t.rightNow} className="lg:col-span-2">
          <div className="grid grid-cols-3 gap-2">
            <Link href="/bar" className="tile text-center hover:bg-bean-100">
              <div className="num text-2xl font-extrabold">{liveCounts.incoming}</div>
              <div className="truncate text-xs text-bean-600">{t.barIncoming}</div>
            </Link>
            <Link href="/bar" className="tile text-center hover:bg-bean-100">
              <div className="num text-2xl font-extrabold">{liveCounts.preparing}</div>
              <div className="truncate text-xs text-bean-600">{t.preparing}</div>
            </Link>
            <Link href="/bar" className="tile text-center hover:bg-bean-100">
              <div className="num text-2xl font-extrabold">{liveCounts.ready}</div>
              <div className="truncate text-xs text-bean-600">{t.ready}</div>
            </Link>
          </div>
          <Link
            href="/drawer"
            className={`mt-2 flex items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-sm ${
              register.data ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800"
            }`}
          >
            <span className="flex items-center gap-2 font-semibold">
              <Icon name="cash" className="h-4 w-4" />
              {register.data ? t.drawerOpen : t.drawerClosed}
            </span>
            {register.data && (
              <span className="num text-xs">
                {fmtTime(register.data.opened_at, locale)} · {fmtAED(register.data.opening_cash, locale)}
              </span>
            )}
          </Link>
        </Panel>

        {/* Sales by hour / trend */}
        <Panel title={range === "today" ? t.byHour : t.salesTrend} className="lg:col-span-2">
          {range === "today" ? (
            a.sales ? (
              <Bars
                data={hourRange.map((h) => ({ key: String(h), v: byHour.get(h) ?? 0, label: String(h).padStart(2, "0"), title: fmtAED(byHour.get(h) ?? 0, locale, 0) }))}
                max={maxHour}
                every={3}
              />
            ) : (
              <Empty>{t.noSalesYet}</Empty>
            )
          ) : (
            <Bars
              data={days.map((d) => ({
                key: d,
                v: byDay.get(d) ?? 0,
                label: fmtDate(d + "T12:00:00+04:00", locale, { month: undefined }),
                title: fmtAED(byDay.get(d) ?? 0, locale, 0),
                hot: d === today,
              }))}
              max={maxDay}
              every={2}
            />
          )}
        </Panel>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Panel title={t.topItems} aside={<Link href="/reports" className="font-medium hover:text-accent-ink">{t.seeAll}</Link>}>
          {top.length ? (
            <ul className="space-y-2">
              {top.map((i, n) => (
                <li key={i.id}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate font-semibold">
                      <span className="num me-1.5 text-bean-500">{n + 1}</span>
                      {localName(i, locale)}
                    </span>
                    <span className="num shrink-0 text-xs text-bean-600">
                      {fmtNum(i.qty, locale, 0)} · {fmtAED(i.sales, locale, 0)}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-bean-100">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${(Number(i.sales) / maxTop) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>{t.noSalesYet}</Empty>
          )}
        </Panel>

        <Panel title={t.byChannel}>
          {channels.length ? (
            <ul className="space-y-2">
              {channels.map((c) => {
                const share = a.sales ? (Number(c.sales) / a.sales) * 100 : 0;
                return (
                  <li key={c.code}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate font-semibold">
                        {localName(c, locale)} <span className="num text-xs font-normal text-bean-500">({c.orders})</span>
                      </span>
                      <span className="num shrink-0 text-xs text-bean-600">
                        {fmtAED(c.sales, locale, 0)} · {share.toFixed(0)}%
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-bean-100">
                      <div className="h-full rounded-full bg-amber-700" style={{ width: `${share}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty>{t.noSalesYet}</Empty>
          )}
          {payTotal > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-bean-100 pt-3">
              {(rep?.by_method ?? []).map((m) => (
                <span key={m.method} className="badge bg-bean-100 text-bean-700">
                  {t[`pay_${m.method}` as "pay_cash"] ?? m.method} <span className="num">{((Number(m.amount) / payTotal) * 100).toFixed(0)}%</span>
                </span>
              ))}
            </div>
          )}
        </Panel>

        <Panel title={t.onShiftToday} aside={<Link href="/schedule" className="font-medium hover:text-accent-ink">{t.seeAll}</Link>}>
          {onShift.length ? (
            <ul className="space-y-1.5">
              {onShift.map((s) => {
                const working = Date.parse(s.starts_at) <= now && Date.parse(s.ends_at) > now;
                return (
                  <li key={s.id} className={`flex items-center justify-between gap-3 rounded-2xl px-3 py-2 ${working ? "bg-green-50" : "bg-bean-50"}`}>
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${working ? "bg-green-700" : "bg-bean-300"}`} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{s.profiles?.full_name ?? "?"}</span>
                        {s.station && <span className="block truncate text-xs text-bean-600">{s.station}</span>}
                      </span>
                    </span>
                    <span className="num shrink-0 text-sm font-bold text-bean-700">
                      {fmtTime(s.starts_at, locale)}–{fmtTime(s.ends_at, locale)}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty>{t.noShifts}</Empty>
          )}
        </Panel>

        <Panel title={t.eventsThisWeek} aside={<Link href="/events" className="font-medium hover:text-accent-ink">{t.seeAll}</Link>}>
          {events.data?.length ? (
            <ul className="space-y-1.5">
              {events.data.map((e) => (
                <li key={e.id}>
                  <Link href={`/events/${e.id}`} className="flex items-center gap-3 rounded-2xl bg-bean-50 px-3 py-2 hover:bg-bean-100">
                    <span className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl bg-amber-100 leading-none text-amber-800">
                      <span className="num text-sm font-extrabold">{fmtDate(e.starts_at, locale, { month: undefined })}</span>
                      <span className="mt-0.5 text-[10px] font-semibold uppercase">{fmtDate(e.starts_at, locale, { day: undefined })}</span>
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{e.title}</span>
                      <span className="block truncate text-xs text-bean-600">
                        <span className="num">{fmtTime(e.starts_at, locale)}</span>
                        {e.guests ? <> · <span className="num">{e.guests}</span> {t.guests}</> : null}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>{t.noEvents}</Empty>
          )}
        </Panel>

        <Panel title={t.quickActions} className="md:col-span-2">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {(
              [
                ["/pos", "cart", t.till],
                ["/invoices/new", "camera", t.scanInvoice],
                ["/schedule", "calendar", t.addShift],
                ["/stock/count", "box", t.stockCount],
                ["/reports", "chart", t.reports],
                ["/events/new", "star", t.newEvent],
              ] as [string, IconName, string][]
            ).map(([href, icon, label]) => (
              <Link key={href} href={href} className="flex flex-col items-center gap-1.5 rounded-2xl bg-bean-50 px-1 py-3 text-center hover:bg-bean-100">
                <Icon name={icon} className="h-5 w-5 text-bean-700" />
                <span className="line-clamp-2 text-xs leading-tight font-semibold">{label}</span>
              </Link>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  d,
  cmp,
  big,
  points,
  lowerIsBetter,
  tone = "",
  className = "",
}: {
  label: string;
  value: string;
  d: number | null;
  cmp: string;
  big?: boolean;
  points?: boolean;
  lowerIsBetter?: boolean;
  tone?: string;
  className?: string;
}) {
  const good = d == null || Math.abs(d) < 0.05 ? null : lowerIsBetter ? d < 0 : d > 0;
  return (
    <div className={`card p-3.5 ${big ? "bg-accent text-white" : ""} ${className}`}>
      <div className={`eyebrow truncate ${big ? "text-white/80" : ""}`}>{label}</div>
      <div className={`num mt-1 font-extrabold tracking-tight ${big ? "text-4xl" : "text-[clamp(1.1rem,5vw,1.5rem)] whitespace-nowrap"} ${tone}`}>{value}</div>
      <div className={`mt-1 truncate text-xs ${big ? "text-white/80" : "text-bean-600"}`} title={cmp} aria-label={cmp}>
        {d == null ? (
          <span>–</span>
        ) : (
          <span className={`num font-bold ${big ? "text-white" : good == null ? "" : good ? "text-green-700" : "text-red-700"}`}>
            {d > 0 ? "▲" : d < 0 ? "▼" : "•"} {Math.abs(d).toFixed(points ? 1 : 0)}
            {points ? " pt" : "%"}
          </span>
        )}
      </div>
    </div>
  );
}

function Bars({ data, max, every }: { data: { key: string; v: number; label: string; title: string; hot?: boolean }[]; max: number; every: number }) {
  return (
    <div className="flex h-36 items-stretch gap-[3px]" dir="ltr">
      {data.map((x, i) => (
        <div key={x.key} className="flex min-w-0 flex-1 flex-col" title={`${x.label}: ${x.title}`}>
          <div className="flex flex-1 items-end">
            <div
              className={`w-full rounded-t-md ${x.hot ? "bg-amber-700" : x.v ? "bg-accent" : "bg-bean-100"}`}
              style={{ height: `${Math.max(x.v ? 4 : 2, (x.v / max) * 100)}%` }}
            />
          </div>
          <div className="num mt-1 h-3.5 truncate text-center text-[10px] leading-none text-bean-500">{i % every === 0 ? x.label : ""}</div>
        </div>
      ))}
    </div>
  );
}
