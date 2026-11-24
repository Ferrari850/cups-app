"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Dict } from "@/lib/i18n";
import type { Locale } from "@/lib/format";

type Status = "incoming" | "preparing" | "ready";
type BarOrder = {
  id: string;
  ticket_no: number;
  status: Status;
  created_at: string;
  status_at: string;
  car_plate: string | null;
  car_color: string | null;
  parking_spot: string | null;
  customer_name: string | null;
  external_ref: string | null;
  notes: string | null;
  channels: { name: string; name_ar: string | null; needs_car: boolean } | null;
  order_lines: { id: string; name: string; name_ar: string | null; qty: number; note: string | null; sort: number; modifiers: { name: string; name_ar: string | null }[] }[];
};

const NEXT: Record<Status, Status | "done"> = { incoming: "preparing", preparing: "ready", ready: "done" };
const nm = (r: { name: string; name_ar: string | null }, l: Locale) => (l === "ar" && r.name_ar ? r.name_ar : r.name);

/** Live screen for the bar: Incoming → Preparing → Ready, with timers and a sound for new orders. */
export default function Board({ t, locale }: { t: Dict; locale: Locale }) {
  const [orders, setOrders] = useState<BarOrder[]>([]);
  const [sound, setSound] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const soundOn = useRef(false);
  const supabase = useRef(createClient()).current;

  const beep = useCallback(() => {
    const ctx = audio.current;
    if (!ctx || !soundOn.current) return;
    for (const [i, f] of [880, 1175].entries()) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.16);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.18);
      o.stop(ctx.currentTime + i * 0.18 + 0.17);
    }
  }, []);

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 36 * 3600_000).toISOString();
    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, ticket_no, status, created_at, status_at, car_plate, car_color, parking_spot, customer_name, external_ref, notes, channels(name, name_ar, needs_car), order_lines(id, name, name_ar, qty, note, sort, modifiers)",
      )
      .in("status", ["incoming", "preparing", "ready"])
      .gte("created_at", since)
      .order("created_at");
    if (error) {
      setError(error.message);
      return;
    }
    setError(null);
    const list = (data ?? []) as unknown as BarOrder[];
    if (seen.current) {
      if (list.some((o) => o.status === "incoming" && !seen.current!.has(o.id))) beep();
    }
    seen.current = new Set(list.map((o) => o.id));
    setOrders(list);
  }, [supabase, beep]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("bar-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => load())
      .subscribe();
    const poll = setInterval(load, 15_000); // backup if live updates drop
    const tick = setInterval(() => setNow(Date.now()), 10_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [supabase, load]);

  async function advance(o: BarOrder) {
    const next = NEXT[o.status];
    setOrders((os) => (next === "done" ? os.filter((x) => x.id !== o.id) : os.map((x) => (x.id === o.id ? { ...x, status: next, status_at: new Date().toISOString() } : x))));
    const { error } = await supabase.rpc("set_order_status", { p_order: o.id, p_status: next });
    if (error) setError(error.message);
    load();
  }

  async function back(o: BarOrder) {
    const prev: Status = o.status === "ready" ? "preparing" : "incoming";
    await supabase.rpc("set_order_status", { p_order: o.id, p_status: prev });
    load();
  }

  const cols: { key: Status; title: string; tone: string; action: string }[] = [
    { key: "incoming", title: t.barIncoming, tone: "bg-amber-100 text-amber-800", action: t.startMaking },
    { key: "preparing", title: t.preparing, tone: "bg-blue-100 text-blue-800", action: t.markReady },
    { key: "ready", title: t.ready, tone: "bg-green-100 text-green-800", action: t.handedOver },
  ];

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        {error ? <p className="text-sm text-red-700">{error}</p> : <span />}
        <button
          type="button"
          className={`btn btn-sm ${sound ? "bg-green-100 text-green-800" : "btn-secondary"}`}
          onClick={() => {
            if (!audio.current) audio.current = new AudioContext();
            audio.current.resume();
            soundOn.current = !sound;
            setSound(!sound);
            if (soundOn.current) beep();
          }}
        >
          {sound ? `🔔 ${t.soundOn}` : `🔕 ${t.soundOff}`}
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {cols.map((c) => {
          const list = orders.filter((o) => o.status === c.key);
          return (
            <section key={c.key} className="min-w-0">
              <h2 className="mb-2 flex items-center gap-2 px-1">
                <span className={`badge ${c.tone} text-sm`}>{c.title}</span>
                <span className="num font-bold text-bean-600">{list.length}</span>
              </h2>
              <ul className="space-y-2">
                {list.map((o) => {
                  const mins = Math.floor((now - new Date(o.created_at).getTime()) / 60_000);
                  const late = c.key !== "ready" && mins >= 10 ? "ring-2 ring-red-400" : c.key !== "ready" && mins >= 5 ? "ring-2 ring-amber-300" : "";
                  return (
                    <li key={o.id} className={`card p-3 ${late}`}>
                      <div className="mb-1 flex items-start justify-between gap-2">
                        <div>
                          <span className="num text-3xl font-extrabold">#{o.ticket_no}</span>
                          <div className="text-xs font-semibold text-bean-600">
                            {o.channels ? nm(o.channels, locale) : ""}
                            {o.external_ref && <span className="num"> · {o.external_ref}</span>}
                          </div>
                        </div>
                        <span className={`num text-lg font-bold ${mins >= 10 && c.key !== "ready" ? "text-red-700" : "text-bean-600"}`}>{mins}′</span>
                      </div>
                      {(o.car_plate || o.parking_spot || o.customer_name) && (
                        <p className="mb-1 rounded-xl bg-bean-50 px-2 py-1 text-sm font-semibold">
                          {o.car_plate && <span className="num">🚗 {o.car_plate}</span>} {o.car_color} {o.parking_spot && <>· {t.spot} <span className="num">{o.parking_spot}</span></>}
                          {o.customer_name && <> · {o.customer_name}</>}
                        </p>
                      )}
                      <ul className="mb-2 space-y-0.5">
                        {[...o.order_lines].sort((a, b) => a.sort - b.sort).map((l) => (
                          <li key={l.id} className="leading-tight">
                            <b className="num">{l.qty}×</b> <span className="font-semibold">{nm(l, locale)}</span>
                            {l.modifiers?.length > 0 && <div className="ps-6 text-sm text-bean-600">{l.modifiers.map((m) => nm(m, locale)).join(" · ")}</div>}
                            {l.note && <div className="ps-6 text-sm font-semibold text-amber-800">* {l.note}</div>}
                          </li>
                        ))}
                      </ul>
                      {o.notes && <p className="mb-2 text-sm font-semibold text-amber-800">* {o.notes}</p>}
                      <div className="flex gap-2">
                        {c.key !== "incoming" && (
                          <button type="button" className="btn-secondary btn-sm" onClick={() => back(o)} aria-label={t.back}>
                            ↩
                          </button>
                        )}
                        <button type="button" className="btn-primary flex-1" onClick={() => advance(o)}>
                          {c.action}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
