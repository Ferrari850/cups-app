"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { Dict } from "@/lib/i18n";
import type { Locale } from "@/lib/format";
import { fmtAED } from "@/lib/format";
import { channelPrice, itemPrice, type Channel, type ModGroup, type PosItem, type Settings } from "@/lib/pos";
import { eposPrint } from "@/lib/epos";
import { Icon } from "@/components/icons";
import { enterDraw, lookupPlate, placeOrder, setSoldOut, type PastOrder, type PlacedOrder } from "./actions";
import { getPrintJob } from "../receipt/actions";

type Line = { key: string; itemId: string; options: string[]; qty: number; note: string };
type PayMode = "cash" | "card" | "split" | "app";

const nm = (r: { name: string; name_ar: string | null }, l: Locale) => (l === "ar" && r.name_ar ? r.name_ar : r.name);
const r2 = (n: number) => Math.round(n * 100) / 100;

export default function Till({
  t,
  locale,
  isManager,
  channels,
  items,
  groups,
  settings,
  drawerOpen,
}: {
  t: Dict;
  locale: Locale;
  isManager: boolean;
  channels: Channel[];
  items: PosItem[];
  groups: ModGroup[];
  settings: Settings | null;
  drawerOpen: boolean;
}) {
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const ch = channels.find((c) => c.id === channelId) ?? channels[0];
  const [cat, setCat] = useState<string>("");
  const [q, setQ] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [picking, setPicking] = useState<{ item: PosItem; options: string[]; editKey?: string } | null>(null);
  const [car, setCar] = useState({ car_plate: "", car_color: "", parking_spot: "" });
  const [cust, setCust] = useState({ customer_name: "", customer_phone: "", external_ref: "", notes: "" });
  const [usual, setUsual] = useState<PastOrder[]>([]);
  const [paying, setPaying] = useState<PayMode | null>(null);
  const [tendered, setTendered] = useState("");
  const [splitCash, setSplitCash] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ order: PlacedOrder; change: number } | null>(null);
  const [printMsg, setPrintMsg] = useState<string | null>(null);
  const [soldOutMode, setSoldOutMode] = useState(false);
  const [online, setOnline] = useState(true);
  const [pending, start] = useTransition();
  // When the order can go in the prize draw, the Wi-Fi receipt waits until the cashier
  // enters or skips the draw, so the printed receipt shows the entry and the phone.
  const heldPrint = useRef<string | null>(null);
  const drawMin = Number(settings?.draw_min_total ?? 50);
  const drawOn = !!settings?.draw_enabled && !ch?.is_app;

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const optById = useMemo(() => {
    const m = new Map<string, ModGroup["options"][number] & { group: ModGroup }>();
    for (const g of groups) for (const o of g.options) m.set(o.id, { ...o, group: g });
    return m;
  }, [groups]);
  const cats = useMemo(() => [...new Set(items.map((i) => i.category ?? ""))].filter(Boolean), [items]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // "Your usual?": look the plate up after typing stops.
  useEffect(() => {
    const plate = car.car_plate.trim();
    if (!ch?.needs_car || plate.length < 2) {
      setUsual([]);
      return;
    }
    const id = setTimeout(() => lookupPlate(plate).then(setUsual).catch(() => setUsual([])), 500);
    return () => clearTimeout(id);
  }, [car.car_plate, ch?.needs_car]);

  if (!ch) return <p className="card mt-4">{t.noChannels}</p>;

  const optPrice = (id: string) => channelPrice(optById.get(id)?.price_delta ?? 0, ch) ?? 0;
  const unitPrice = (l: Pick<Line, "itemId" | "options">) => {
    const it = byId.get(l.itemId);
    if (!it) return 0;
    return r2((itemPrice(it, ch) ?? 0) + l.options.reduce((s, o) => s + optPrice(o), 0));
  };
  const total = r2(lines.reduce((s, l) => s + unitPrice(l) * l.qty, 0));
  const count = lines.reduce((s, l) => s + l.qty, 0);

  const shown = items.filter(
    (i) =>
      (!cat || i.category === cat) &&
      (!q || `${i.name} ${i.name_ar ?? ""}`.toLowerCase().includes(q.toLowerCase())),
  );

  function addLine(itemId: string, options: string[], qty = 1) {
    setLines((ls) => {
      const same = ls.find((l) => l.itemId === itemId && l.options.join() === [...options].sort().join() && !l.note);
      if (same) return ls.map((l) => (l === same ? { ...l, qty: Math.min(99, l.qty + qty) } : l));
      return [...ls, { key: crypto.randomUUID(), itemId, options: [...options].sort(), qty, note: "" }];
    });
  }

  function tapItem(it: PosItem) {
    if (soldOutMode) {
      start(() => setSoldOut(it.id, !it.sold_out));
      return;
    }
    if (it.sold_out || itemPrice(it, ch) == null) return;
    if (it.groups.length) setPicking({ item: it, options: [] });
    else addLine(it.id, []);
  }

  function releasePrint() {
    const id = heldPrint.current;
    heldPrint.current = null;
    if (id) wifiPrint(id).catch(() => setPrintMsg(t.printFailed));
  }

  function reset() {
    releasePrint();
    setLines([]);
    setCar({ car_plate: "", car_color: "", parking_spot: "" });
    setCust({ customer_name: "", customer_phone: "", external_ref: "", notes: "" });
    setUsual([]);
    setPaying(null);
    setTendered("");
    setSplitCash("");
    setError(null);
    setDone(null);
    setPrintMsg(null);
  }

  async function wifiPrint(orderId: string) {
    const job = await getPrintJob(orderId);
    if (!job?.ip) return;
    setPrintMsg(t.printing);
    const res = await eposPrint(job.ip, job.xml);
    setPrintMsg(res.ok ? t.printed : `${t.printFailed} (${res.error})`);
  }

  function pay(mode: PayMode) {
    setError(null);
    let payments: { method: "cash" | "card" | "app"; amount: number }[] = [];
    let change = 0;
    if (mode === "app") payments = [{ method: "app", amount: total }];
    if (mode === "card") payments = [{ method: "card", amount: total }];
    if (mode === "cash") {
      const given = tendered ? Number(tendered.replace(",", ".")) : total;
      if (!(given >= total)) return setError(t.notEnoughCash);
      change = r2(given - total);
      payments = [{ method: "cash", amount: total }];
    }
    if (mode === "split") {
      const c = r2(Number(splitCash.replace(",", ".")) || 0);
      if (c <= 0 || c >= total) return setError(t.splitHint);
      payments = [
        { method: "cash", amount: c },
        { method: "card", amount: r2(total - c) },
      ];
    }
    const needsCar = ch.needs_car;
    start(async () => {
      const res = await placeOrder({
        channel_id: ch.id,
        lines: lines.map((l) => ({ menu_item_id: l.itemId, qty: l.qty, options: l.options, note: l.note || undefined })),
        payments,
        ...(needsCar ? car : {}),
        ...cust,
      });
      if (!res.ok) {
        setError(explain(res.error, t));
        return;
      }
      setPaying(null);
      setDone({ order: res.order, change });
      if (drawOn && res.order.total > drawMin) heldPrint.current = res.order.id;
      else wifiPrint(res.order.id).catch(() => setPrintMsg(t.printFailed));
    });
  }

  function repeat(o: PastOrder) {
    for (const l of o.lines) {
      if (!l.menu_item_id || !byId.has(l.menu_item_id)) continue;
      const it = byId.get(l.menu_item_id)!;
      if (it.sold_out) continue;
      addLine(l.menu_item_id, (l.modifiers ?? []).map((m) => m.id).filter((id) => optById.has(id)), l.qty);
    }
    if (o.customer_name && !cust.customer_name) setCust((c) => ({ ...c, customer_name: o.customer_name ?? "" }));
    if (o.car_color && !car.car_color) setCar((c) => ({ ...c, car_color: o.car_color ?? "" }));
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_400px]">
      {/* Menu side */}
      <section className="min-w-0">
        {!online && <p className="mb-2 rounded-2xl bg-red-100 px-3 py-2 text-sm font-semibold text-red-800">{t.offline}</p>}
        {!drawerOpen && (
          <Link href="/drawer" className="mb-2 block rounded-2xl bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-800">
            {t.drawerClosedHint}
          </Link>
        )}
        <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
          {channels.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setChannelId(c.id)}
              className={`btn shrink-0 ${c.id === ch.id ? "bg-accent text-white" : "bg-surface text-bean-700 shadow-card"}`}
            >
              {nm(c, locale)}
            </button>
          ))}
        </div>
        <div className="mb-2 flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search} className="input" />
          {isManager && (
            <button
              type="button"
              onClick={() => setSoldOutMode((v) => !v)}
              className={`btn shrink-0 ${soldOutMode ? "bg-red-600 text-white" : "btn-secondary"}`}
            >
              {t.soldOut}
            </button>
          )}
        </div>
        {soldOutMode && <p className="mb-2 text-sm font-semibold text-red-700">{t.soldOutModeHint}</p>}
        <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
          {["", ...cats].map((c) => (
            <button
              key={c || "all"}
              type="button"
              onClick={() => setCat(c)}
              className={`shrink-0 rounded-xl px-3 py-1.5 text-sm font-semibold ${cat === c ? "bg-bean-800 text-page" : "bg-bean-100 text-bean-700"}`}
            >
              {c || t.all}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 min-[340px]:grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {shown.map((it) => {
            const price = itemPrice(it, ch);
            const off = it.sold_out || price == null;
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => tapItem(it)}
                disabled={pending && soldOutMode}
                className={`flex min-h-20 flex-col justify-between overflow-hidden rounded-xl text-start shadow-card transition active:scale-[.97] ${
                  off ? "bg-bean-100 text-bean-500" : "bg-surface"
                } ${soldOutMode ? "ring-2 ring-red-300" : ""} ${it.image_url ? "pb-2" : "p-2"}`}
              >
                {it.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.image_url} alt="" loading="lazy" className={`mb-1.5 aspect-square w-full object-cover ${off ? "opacity-40 grayscale" : ""}`} />
                )}
                <span className={`line-clamp-2 text-sm font-bold leading-tight ${it.image_url ? "px-2" : ""}`}>{nm(it, locale)}</span>
                <span className={`mt-1 flex items-end justify-between gap-1 ${it.image_url ? "px-2" : ""}`}>
                  <span className="num text-sm font-extrabold text-accent-ink">{price != null ? fmtAED(price, locale) : t.noPriceSet}</span>
                  {it.sold_out && <span className="badge bg-red-100 text-red-800">{t.soldOut}</span>}
                  {!it.sold_out && it.groups.length > 0 && <span className="text-xs text-bean-500">+</span>}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Order side */}
      <aside className="lg:sticky lg:top-16 lg:self-start">
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="h2">{t.order} · {nm(ch, locale)}</h2>
            {lines.length > 0 && (
              <button type="button" onClick={reset} className="text-sm font-semibold text-red-700">
                {t.clear}
              </button>
            )}
          </div>

          {ch.needs_car && (
            <div className="space-y-2 rounded-2xl bg-bean-50 p-2">
              <div className="grid grid-cols-3 gap-2">
                <input
                  value={car.car_plate}
                  onChange={(e) => setCar({ ...car, car_plate: e.target.value.toUpperCase() })}
                  placeholder={t.carPlate}
                  className="input col-span-3 num text-lg font-bold tracking-wider"
                />
                <input value={car.car_color} onChange={(e) => setCar({ ...car, car_color: e.target.value })} placeholder={t.carColor} className="input col-span-2" />
                <input value={car.parking_spot} onChange={(e) => setCar({ ...car, parking_spot: e.target.value })} placeholder={t.spot} className="input num" />
              </div>
              {usual.length > 0 && (
                <div>
                  <div className="eyebrow mb-1">{t.yourUsual}</div>
                  <ul className="space-y-1">
                    {usual.map((o) => (
                      <li key={o.id}>
                        <button type="button" onClick={() => repeat(o)} className="w-full rounded-xl bg-surface px-3 py-2 text-start text-sm shadow-card">
                          {o.customer_name && <b>{o.customer_name}: </b>}
                          {o.lines.map((l) => `${l.qty}× ${nm(l, locale)}`).join(", ")}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          {ch.is_app && (
            <input
              value={cust.external_ref}
              onChange={(e) => setCust({ ...cust, external_ref: e.target.value })}
              placeholder={t.appOrderNo}
              className="input num"
            />
          )}

          {lines.length === 0 ? (
            <p className="muted py-6 text-center">{t.tapToAdd}</p>
          ) : (
            <ul className="max-h-[45dvh] space-y-1.5 overflow-y-auto">
              {lines.map((l) => {
                const it = byId.get(l.itemId);
                if (!it) return null;
                return (
                  <li key={l.key} className="rounded-2xl bg-bean-50 p-2">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold leading-tight">{nm(it, locale)}</div>
                        {l.options.length > 0 && (
                          <div className="text-xs text-bean-600">
                            {l.options.map((o) => (optById.get(o) ? nm(optById.get(o)!, locale) : "")).join(" · ")}
                          </div>
                        )}
                        <input
                          value={l.note}
                          onChange={(e) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, note: e.target.value } : x)))}
                          placeholder={t.lineNote}
                          className="mt-1 w-full bg-transparent text-xs text-bean-700 outline-none placeholder:text-bean-400"
                        />
                      </div>
                      <div className="num shrink-0 font-bold">{fmtAED(unitPrice(l) * l.qty, locale)}</div>
                    </div>
                    <div className="mt-1 flex items-center gap-1">
                      <button
                        type="button"
                        className="btn-secondary btn-sm w-10"
                        onClick={() =>
                          setLines((ls) => ls.flatMap((x) => (x.key !== l.key ? [x] : x.qty > 1 ? [{ ...x, qty: x.qty - 1 }] : [])))
                        }
                      >
                        −
                      </button>
                      <span className="num w-8 text-center font-bold">{l.qty}</span>
                      <button
                        type="button"
                        className="btn-secondary btn-sm w-10"
                        onClick={() => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, qty: Math.min(99, x.qty + 1) } : x)))}
                      >
                        +
                      </button>
                      {it.groups.length > 0 && (
                        <button
                          type="button"
                          className="btn-secondary btn-sm ms-auto"
                          onClick={() => setPicking({ item: it, options: l.options, editKey: l.key })}
                        >
                          {t.edit}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <details className="rounded-2xl bg-bean-50 px-3 py-2 text-sm">
            <summary className="cursor-pointer font-semibold">{t.customerAndNotes}</summary>
            <div className="mt-2 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input value={cust.customer_name} onChange={(e) => setCust({ ...cust, customer_name: e.target.value })} placeholder={t.customerName} className="input" />
                <input value={cust.customer_phone} onChange={(e) => setCust({ ...cust, customer_phone: e.target.value })} placeholder={t.phone} type="tel" dir="ltr" className="input" />
              </div>
              <input value={cust.notes} onChange={(e) => setCust({ ...cust, notes: e.target.value })} placeholder={t.orderNote} className="input" />
            </div>
          </details>

          <div className="flex items-end justify-between border-t border-bean-100 pt-3">
            <div>
              <div className="eyebrow">{t.total}</div>
              <div className="muted num text-xs">
                {count} · {t.vatIncluded} {fmtAED(total - total / 1.05, locale)}
              </div>
            </div>
            <div className="num text-3xl font-extrabold tracking-tight">{fmtAED(total, locale)}</div>
          </div>

          {error && !paying && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          {ch.is_app ? (
            <button type="button" className="btn-primary w-full py-4 text-base" disabled={!lines.length || pending} onClick={() => pay("app")}>
              {pending ? t.saving : `${t.paidInApp} ${nm(ch, locale)}`}
            </button>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <button type="button" className="btn-primary py-4 text-base" disabled={!lines.length} onClick={() => setPaying("cash")}>
                {t.cash}
              </button>
              <button type="button" className="btn-primary py-4 text-base" disabled={!lines.length} onClick={() => setPaying("card")}>
                {t.card}
              </button>
              <button type="button" className="btn-secondary py-4 text-base" disabled={!lines.length} onClick={() => setPaying("split")}>
                {t.split}
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Floating total on phones */}
      {lines.length > 0 && (
        <a href="#order" className="fixed inset-x-[max(0.75rem,env(safe-area-inset-left))] bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 flex items-center justify-between rounded-2xl bg-accent px-4 py-3 font-bold text-white shadow-float lg:hidden"
          onClick={(e) => {
            e.preventDefault();
            document.querySelector("aside")?.scrollIntoView({ behavior: "smooth" });
          }}
        >
          <span>{t.order} ({count})</span>
          <span className="num">{fmtAED(total, locale)}</span>
        </a>
      )}

      {/* Add-on picker */}
      {picking && (
        <Sheet onClose={() => setPicking(null)}>
          <h2 className="h2 mb-3">{nm(picking.item, locale)}</h2>
          <div className="max-h-[60dvh] space-y-4 overflow-y-auto">
            {groups
              .filter((g) => picking.item.groups.includes(g.id))
              .map((g) => {
                const chosen = picking.options.filter((o) => optById.get(o)?.group.id === g.id);
                return (
                  <div key={g.id}>
                    <div className="eyebrow mb-1.5">
                      {nm(g, locale)} {g.min_select > 0 && <span className="text-red-700">*</span>}
                      {g.max_select > 1 && <span className="ms-1 normal-case">(≤ {g.max_select})</span>}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {g.options.map((o) => {
                        const on = picking.options.includes(o.id);
                        return (
                          <button
                            key={o.id}
                            type="button"
                            onClick={() => {
                              let next = picking.options.filter((x) => x !== o.id);
                              if (!on) {
                                if (g.max_select === 1) next = next.filter((x) => optById.get(x)?.group.id !== g.id);
                                else if (chosen.length >= g.max_select) return;
                                next.push(o.id);
                              }
                              setPicking({ ...picking, options: next });
                            }}
                            className={`rounded-2xl p-3 text-start text-sm font-semibold ${on ? "bg-accent text-white" : "bg-bean-50"}`}
                          >
                            {nm(o, locale)}
                            {o.price_delta !== 0 && <span className="num block text-xs opacity-80">+{fmtAED(optPrice(o.id), locale)}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </div>
          {(() => {
            const missing = groups.some(
              (g) => picking.item.groups.includes(g.id) && picking.options.filter((o) => optById.get(o)?.group.id === g.id).length < g.min_select,
            );
            return (
              <button
                type="button"
                className="btn-primary mt-4 w-full py-3 text-base"
                disabled={missing}
                onClick={() => {
                  if (picking.editKey) {
                    setLines((ls) => ls.map((l) => (l.key === picking.editKey ? { ...l, options: [...picking.options].sort() } : l)));
                  } else addLine(picking.item.id, picking.options);
                  setPicking(null);
                }}
              >
                {picking.editKey ? t.save : t.addToOrder} ·{" "}
                <span className="num">{fmtAED(unitPrice({ itemId: picking.item.id, options: picking.options }), locale)}</span>
              </button>
            );
          })()}
        </Sheet>
      )}

      {/* Payment */}
      {paying && (
        <Sheet onClose={() => (pending ? null : (setPaying(null), setError(null)))}>
          <div className="mb-4 flex items-end justify-between">
            <h2 className="h2">{paying === "cash" ? t.cash : paying === "card" ? t.card : t.split}</h2>
            <div className="num text-3xl font-extrabold">{fmtAED(total, locale)}</div>
          </div>
          {paying === "cash" && (
            <>
              <label className="label">{t.cashGiven}</label>
              <input value={tendered} onChange={(e) => setTendered(e.target.value)} inputMode="decimal" placeholder={total.toFixed(2)} className="input num mb-2 text-2xl font-bold" autoFocus />
              <div className="mb-3 grid grid-cols-4 gap-2">
                {[...new Set([total, Math.ceil(total / 5) * 5, Math.ceil(total / 10) * 10, Math.ceil(total / 50) * 50, 100, 200])]
                  .filter((v) => v >= total)
                  .slice(0, 4)
                  .map((v) => (
                    <button key={v} type="button" onClick={() => setTendered(String(v))} className="btn-secondary num">
                      {v.toFixed(v % 1 ? 2 : 0)}
                    </button>
                  ))}
              </div>
              {tendered && Number(tendered) >= total && (
                <p className="mb-3 rounded-2xl bg-green-50 px-3 py-2 text-lg font-bold text-green-800">
                  {t.change}: <span className="num">{fmtAED(Number(tendered) - total, locale)}</span>
                </p>
              )}
            </>
          )}
          {paying === "card" && <p className="muted mb-3">{t.cardHint}</p>}
          {paying === "split" && (
            <>
              <label className="label">{t.cashPart}</label>
              <input value={splitCash} onChange={(e) => setSplitCash(e.target.value)} inputMode="decimal" className="input num mb-2 text-2xl font-bold" autoFocus />
              {Number(splitCash) > 0 && Number(splitCash) < total && (
                <p className="mb-3 text-lg font-bold">
                  {t.card}: <span className="num">{fmtAED(total - Number(splitCash), locale)}</span>
                </p>
              )}
            </>
          )}
          {error && <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button type="button" className="btn-primary w-full py-4 text-base" disabled={pending} onClick={() => pay(paying)}>
            {pending ? t.saving : t.confirmPayment}
          </button>
        </Sheet>
      )}

      {/* Done */}
      {done && (
        <Sheet onClose={reset}>
          <div className="text-center">
            <div className="eyebrow">{t.ticket}</div>
            <div className="num text-6xl font-extrabold text-accent-ink">#{done.order.ticket_no}</div>
            {done.change > 0 && (
              <p className="mt-3 rounded-2xl bg-green-50 px-3 py-3 text-2xl font-extrabold text-green-800">
                {t.change}: <span className="num">{fmtAED(done.change, locale)}</span>
              </p>
            )}
            {printMsg && <p className="muted mt-2">{printMsg}</p>}
          </div>
          {drawOn && done.order.total > drawMin && (
            <DrawEntry
              key={done.order.id}
              t={t}
              orderId={done.order.id}
              minTotal={drawMin}
              onEntered={releasePrint}
              locale={locale}
              initial={{ name: cust.customer_name, phone: cust.customer_phone }}
            />
          )}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <a href={`/receipt/${done.order.id}?print=1`} target="_blank" className="btn-secondary py-3">
              {t.printReceipt}
            </a>
            <button type="button" className="btn-primary py-3" onClick={reset}>
              {t.newOrder}
            </button>
          </div>
          {settings?.printer_ip && (
            <button type="button" className="btn-secondary btn-sm mt-2 w-full" onClick={() => wifiPrint(done.order.id)}>
              <Icon name="receipt" className="h-4 w-4" /> {t.printAgainWifi}
            </button>
          )}
        </Sheet>
      )}
    </div>
  );
}

/** Optional: the customer gives a name and phone to enter the prize draw. Skipping is just "New order". */
function DrawEntry({ t, orderId, minTotal, locale, initial, onEntered }: { t: Dict; orderId: string; minTotal: number; locale: Locale; initial: { name: string; phone: string }; onEntered: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(initial.phone);
  const [state, setState] = useState<"idle" | "saving" | "done">("idle");
  const [err, setErr] = useState<string | null>(null);

  if (state === "done") {
    return <p className="mt-4 rounded-2xl bg-green-50 px-3 py-3 text-center font-bold text-green-800">✓ {t.drawEntered}</p>;
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-4 flex w-full items-center gap-3 rounded-2xl bg-accent-soft px-3 py-3 text-start">
        <Icon name="gift" className="h-6 w-6 shrink-0 text-accent-ink" />
        <span className="min-w-0 flex-1">
          <span className="block font-bold">{t.drawOffer}</span>
          <span className="block text-xs text-bean-600">{t.drawOfferHint.replace("{min}", fmtAED(minTotal, locale))}</span>
        </span>
      </button>
    );
  }
  async function submit() {
    setErr(null);
    setState("saving");
    const res = await enterDraw(orderId, name, phone);
    if (res.ok) {
      setState("done");
      onEntered();
      return;
    }
    setState("idle");
    const m = res.error;
    setErr(
      m.includes("draw_bad_phone") ? t.drawBadPhone
      : m.includes("draw_bad_name") ? t.drawBadName
      : m.includes("draw_already") ? t.drawAlready
      : `${t.error}: ${m}`,
    );
  }
  return (
    <div className="mt-4 space-y-2 rounded-2xl bg-bean-50 p-3">
      <div className="flex items-center gap-2 font-bold">
        <Icon name="gift" className="h-5 w-5 text-accent-ink" /> {t.prizeDraw}
      </div>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.customerName} className="input" autoFocus />
      <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05X XXX XXXX" type="tel" inputMode="tel" dir="ltr" className="input num" />
      <p className="text-xs text-bean-600">{t.drawPrivacy}</p>
      {err && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
          {t.drawSkip}
        </button>
        <button type="button" className="btn-primary" disabled={state === "saving" || !name.trim() || !phone.trim()} onClick={submit}>
          {state === "saving" ? t.saving : t.drawEnter}
        </button>
      </div>
    </div>
  );
}

function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-t-3xl bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-float sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function explain(msg: string, t: Dict) {
  if (msg.includes("sold_out")) return `${t.soldOut}: ${msg.split(":").slice(1).join(":").trim()}`;
  if (msg.includes("no_price")) return `${t.noPriceSet}: ${msg.split(":").slice(1).join(":").trim()}`;
  if (msg.includes("payment_mismatch")) return t.paymentMismatch;
  if (msg.includes("item_not_available")) return t.itemNotAvailable;
  return `${t.error}: ${msg}`;
}
