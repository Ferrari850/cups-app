"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { effectiveMode, getPrintPrefs, markPrinted, printInFrame, setStationSince, stationSince, wasPrinted } from "@/lib/device-print";

/**
 * Print station: on the till that has the receipt printer, prints every new order placed on any
 * device (staff phones, tablets). Runs on every POS screen of that till while it is open.
 * Turned on in Settings > This device's receipt printer. Waits a few seconds after an order is placed
 * so the device that took it can enter the prize draw or print it itself first.
 */
const WAIT_MS = 6000;

export default function PrintStation({ label }: { label: string }) {
  const [on, setOn] = useState(false);
  const [count, setCount] = useState(0);
  const supabase = useMemo(() => createClient(), []);
  const running = useRef(false);

  useEffect(() => {
    const p = getPrintPrefs();
    setOn(p.station && effectiveMode(p, null) === "computer");
  }, []);

  useEffect(() => {
    if (!on) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function check() {
      if (running.current || stopped) return;
      running.current = true;
      try {
        const since = stationSince();
        const { data } = await supabase
          .from("orders")
          .select("id, created_at, status")
          .gt("created_at", since)
          .order("created_at")
          .limit(30);
        let newest = since;
        let later = false;
        for (const o of (data ?? []) as { id: string; created_at: string; status: string }[]) {
          if (Date.now() - Date.parse(o.created_at) < WAIT_MS) {
            later = true; // too fresh: look again in a moment, and don't move past it
            break;
          }
          newest = o.created_at;
          if (o.status === "cancelled" || wasPrinted(o.id)) continue;
          markPrinted(o.id);
          await printInFrame(`/receipt/${o.id}`);
          setCount((c) => c + 1);
        }
        if (newest !== since) setStationSince(newest);
        if (later && !stopped) {
          if (timer) clearTimeout(timer);
          timer = setTimeout(check, 2000);
        }
      } finally {
        running.current = false;
      }
    }

    check();
    const channel = supabase
      .channel("print-station")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(check, WAIT_MS + 500);
      })
      .subscribe();
    const poll = setInterval(check, 15_000); // backup if live updates drop
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [on, supabase]);

  if (!on) return null;
  return (
    <span className="hidden items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-bold text-green-800 sm:inline-flex" title={label}>
      <span className="h-2 w-2 rounded-full bg-green-600" /> {label}
      {count > 0 && <span className="num">· {count}</span>}
    </span>
  );
}
