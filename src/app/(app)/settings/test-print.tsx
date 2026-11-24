"use client";

import { useState } from "react";
import { eposPrint, ticketXml } from "@/lib/epos";

export default function TestPrint({ ip, labels }: { ip: string; labels: { test: string; ok: string; fail: string; sending: string } }) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="btn-secondary btn-sm"
        onClick={async () => {
          setMsg(labels.sending);
          const xml = ticketXml({
            cafe: "CUPS",
            title: "TEST PRINT",
            invoice: "TEST",
            ticket: 0,
            date: new Date().toLocaleString("en-GB"),
            channel: "Wi-Fi printer",
            lines: [{ qty: 1, name: "Test latte", mods: ["Oat milk"], total: "0.00" }],
            total: "0.00",
            vat: "0.00",
            net: "0.00",
            payments: [],
            footer: "It works!",
          });
          const r = await eposPrint(ip, xml);
          setMsg(r.ok ? labels.ok : `${labels.fail} (${r.error})`);
        }}
      >
        {labels.test}
      </button>
      <a href={`https://${ip}`} target="_blank" rel="noreferrer" className="text-sm font-semibold text-accent-ink underline">https://{ip}</a>
      {msg && <span className="text-sm">{msg}</span>}
    </div>
  );
}
