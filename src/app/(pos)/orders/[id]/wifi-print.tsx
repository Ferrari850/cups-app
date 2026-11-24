"use client";

import { useState } from "react";
import type { Dict } from "@/lib/i18n";
import { eposPrint } from "@/lib/epos";
import { getPrintJob } from "../../receipt/actions";

export default function WifiPrint({ id, t }: { id: string; t: Dict }) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <button
      type="button"
      className="btn-secondary"
      onClick={async () => {
        setMsg(t.printing);
        const job = await getPrintJob(id);
        if (!job?.ip) return setMsg(t.noPrinter);
        const r = await eposPrint(job.ip, job.xml);
        setMsg(r.ok ? t.printed : `${t.printFailed} (${r.error})`);
      }}
    >
      {msg ?? t.printWifi}
    </button>
  );
}
