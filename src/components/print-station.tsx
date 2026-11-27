"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { effectiveMode, getPrintPrefs, markPrinted, placingHere, printInFrame, setStationSince, stationSince, wasPrinted } from "@/lib/device-print";

/**
 * Print station: on the till that has the receipt printer, prints every new order placed on any
 * device (staff phones, tablets). Runs on every screen of the app on that till while it is open.
 * Turned on in Settings > This device's receipt printer. Prints about a second after the order is placed
 * (Realtime), with a poll as backup. An order this till is placing itself is left to the till.
 */


export default function PrintStation({ label }: { label: string }) {
  const [on, setOn] = useState(false);
  const [count, setCount] = useState(0);
  const supabase = useMemo(() => createClient(), []);
  const running = useRef(false);

  useEffect(() => {
    const read = () => {
      const p = getPrintPrefs();
      setOn(p.station && effectiveMode(p, null) === "computer");
    };
    read();
    window.addEventListener("cups-print-prefs", read); // turned on or off in Settings
    return () => window.removeEventListener("cups-print-prefs", read);
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
          if (placingHere()) {
            later = true; // this till is placing an order: wait until it has marked its own receipt
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
          timer = setTimeout(check, 400);
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
        timer = setTimeout(check, 300);
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
