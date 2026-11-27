"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Dict } from "@/lib/i18n";
import type { Locale } from "@/lib/format";

export type Station = "bar" | "kitchen";
type Status = "incoming" | "preparing" | "ready";
type LineStatus = Status | "done" | "cancelled";
type Line = {
  id: string;
  name: string;
  name_ar: string | null;
  qty: number;
  note: string | null;
  sort: number;
  modifiers: { name: string; name_ar: string | null }[];
  station?: Station;
  status?: LineStatus;
};
type Row = {
  id: string;
  ticket_no: number;
  status: LineStatus;
  created_at: string;
  car_plate: string | null;
  car_color: string | null;
  parking_spot: string | null;
  customer_name: string | null;
  external_ref: string | null;
  notes: string | null;
  channels: { name: string; name_ar: string | null } | null;
  mine?: Line[];
  others?: { station: Station; status: LineStatus; qty: number }[];
  order_lines?: Line[];
};
type Ticket = Row & { stage: Status; lines: Line[]; other: { qty: number; stage: LineStatus } | null };

const ORDER: LineStatus[] = ["incoming", "preparing", "ready", "done", "cancelled"];
const NEXT: Record<Status, Status | "done"> = { incoming: "preparing", preparing: "ready", ready: "done" };
const nm = (r: { name: string; name_ar: string | null }, l: Locale) => (l === "ar" && r.name_ar ? r.name_ar : r.name);
const slowest = (xs: LineStatus[]) => xs.reduce((a, b) => (ORDER.indexOf(b) < ORDER.indexOf(a) ? b : a), "done" as LineStatus);

const HEAD = "id, ticket_no, status, created_at, car_plate, car_color, parking_spot, customer_name, external_ref, notes, channels(name, name_ar)";
const LINE = "id, name, name_ar, qty, note, sort, modifiers";

/**
 * Live screen for one station. Each station only sees and moves its own items:
 * Incoming → Preparing → Ready → handed over. Several screens on the same station
 * (the long bar) stay in step through Supabase Realtime.
 */
export default function StationBoard({ station, t, locale }: { station: Station; t: Dict; locale: Locale }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [sound, setSound] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [legacy, setLegacy] = useState(false); // database update not run yet: whole orders, bar only
  const seen = useRef<Set<string> | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const soundOn = useRef(false);
  const busy = useRef(0);
  const supabase = useRef(createClient()).current;

  const beep = useCallback(() => {
    const ctx = audio.current;
    if (!ctx || !soundOn.current) return;
    const notes = station === "kitchen" ? [660, 880, 660] : [880, 1175];
    for (const [i, f] of notes.entries()) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.16);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.18);
      o.stop(ctx.currentTime + i * 0.18 + 0.17);
    }
  }, [station]);

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 36 * 3600_000).toISOString();
    let list: Ticket[] = [];
    const res = await supabase
      .from("orders")
      .select(`${HEAD}, mine:order_lines!inner(${LINE}, station, status), others:order_lines(station, status, qty)`)
      .neq("status", "cancelled")
      .eq("mine.station", station)
      .in("mine.status", ["incoming", "preparing", "ready"])
      .gte("created_at", since)
      .order("created_at");
    if (res.error && /station|status/.test(res.error.message) && /column|exist/i.test(res.error.message)) {
      // Before the 0008 update: the bar shows whole orders as it used to; the kitchen shows nothing.
      setLegacy(true);
      if (station === "bar") {
        const old = await supabase
          .from("orders")
          .select(`${HEAD}, order_lines(${LINE})`)
          .in("status", ["incoming", "preparing", "ready"])
          .gte("created_at", since)
          .order("created_at");
        if (old.error) return setError(old.error.message);
        list = ((old.data ?? []) as unknown as Row[]).map((o) => ({ ...o, stage: o.status as Status, lines: o.order_lines ?? [], other: null }));
      }
    } else if (res.error) {
      return setError(res.error.message);
    } else {
      setLegacy(false);
      list = ((res.data ?? []) as unknown as Row[]).map((o) => {
        const lines = o.mine ?? [];
        const rest = (o.others ?? []).filter((x) => x.station !== station);
        return {
          ...o,
          lines,
          stage: slowest(lines.map((l) => l.status ?? "incoming")) as Status,
          other: rest.length ? { qty: rest.reduce((s, x) => s + x.qty, 0), stage: slowest(rest.map((x) => x.status)) } : null,
        };
      });
    }
    setError(null);
    if (busy.current > 0) return; // a tap is on its way; its own reload will follow
    if (seen.current && list.some((o) => o.stage === "incoming" && !seen.current!.has(o.id))) beep();
    seen.current = new Set(list.map((o) => o.id));
    setTickets(list);
  }, [supabase, beep, station]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`station-${station}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => load())
      .subscribe();
    const poll = setInterval(load, 15_000); // backup if live updates drop
    const tick = setInterval(() => setNow(Date.now()), 10_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [supabase, load, station]);

  // Keep the screen awake while the board is open.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const ask = async () => {
      try {
        const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
        if (wl && document.visibilityState === "visible") lock = await wl.request("screen");
      } catch {
        /* not supported or refused */
      }
    };
    ask();
    document.addEventListener("visibilitychange", ask);
    return () => {
      document.removeEventListener("visibilitychange", ask);
      lock?.release().catch(() => {});
    };
  }, []);

  async function move(o: Ticket, to: Status | "done") {
    busy.current++;
    setTickets((ts) => (to === "done" ? ts.filter((x) => x.id !== o.id) : ts.map((x) => (x.id === o.id ? { ...x, stage: to } : x))));
    const { error } = legacy
      ? await supabase.rpc("set_order_status", { p_order: o.id, p_status: to })
      : await supabase.rpc("set_station_status", { p_order: o.id, p_station: station, p_status: to });
    busy.current--;
    if (error) setError(error.message);
    load();
  }

  const stageName: Record<LineStatus, string> = { incoming: t.os_incoming, preparing: t.os_preparing, ready: t.os_ready, done: t.os_done, cancelled: "" };
  const otherName = station === "bar" ? t.stationKitchen : t.stationBar;
  const cols: { key: Status; title: string; tone: string; action: string }[] = [
    { key: "incoming", title: t.barIncoming, tone: "bg-amber-100 text-amber-800", action: t.startMaking },
    { key: "preparing", title: t.preparing, tone: "bg-blue-100 text-blue-800", action: t.markReady },
    { key: "ready", title: t.ready, tone: "bg-green-100 text-green-800", action: t.handedOver },
  ];

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-xl font-extrabold">
          <span aria-hidden>{station === "bar" ? "☕" : "🍳"}</span>
          {station === "bar" ? t.barDisplay : t.kitchenDisplay}
        </h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-secondary btn-sm hidden sm:inline-flex"
            onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())}
          >
            ⛶ {t.fullScreen}
          </button>
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
      </div>
      {error && <p className="mb-2 text-sm text-red-700">{error}</p>}
      {legacy && <p className="mb-2 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">⚠️ {t.stationsNotReady}</p>}
      <div className="grid gap-3 md:grid-cols-3">
        {cols.map((c) => {
          const list = tickets.filter((o) => o.stage === c.key);
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
                      <ul className="mb-2 space-y-0.5 text-lg">
                        {[...o.lines].sort((a, b) => a.sort - b.sort).map((l) => (
                          <li key={l.id} className="leading-tight">
                            <b className="num">{l.qty}×</b> <span className="font-semibold">{nm(l, locale)}</span>
                            {l.modifiers?.length > 0 && <div className="ps-6 text-sm text-bean-600">{l.modifiers.map((m) => nm(m, locale)).join(" · ")}</div>}
                            {l.note && <div className="ps-6 text-sm font-semibold text-amber-800">* {l.note}</div>}
                          </li>
                        ))}
                      </ul>
                      {o.notes && <p className="mb-2 text-sm font-semibold text-amber-800">* {o.notes}</p>}
                      {o.other && (
                        <p className={`mb-2 rounded-xl px-2 py-1 text-xs font-semibold ${o.other.stage === "ready" || o.other.stage === "done" ? "bg-green-50 text-green-800" : "bg-bean-50 text-bean-700"}`}>
                          {station === "bar" ? "🍳" : "☕"} {t.alsoAt} {otherName}: <span className="num">{o.other.qty}</span> · {stageName[o.other.stage]}
                        </p>
                      )}
                      <div className="flex gap-2">
                        {c.key !== "incoming" && (
                          <button type="button" className="btn-secondary btn-sm" onClick={() => move(o, c.key === "ready" ? "preparing" : "incoming")} aria-label={t.back}>
                            ↩
                          </button>
                        )}
                        <button type="button" className="btn-primary flex-1" onClick={() => move(o, NEXT[c.key])}>
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
