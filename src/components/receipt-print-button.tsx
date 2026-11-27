"use client";

import { useEffect, useState } from "react";
import { effectiveMode, getPrintPrefs, printInFrame } from "@/lib/device-print";

/** "Print receipt": on a till with its own printer it prints in place; elsewhere it opens the receipt. */
export default function ReceiptPrintButton({ id, printerIp, label, printingLabel, className }: { id: string; printerIp: string | null | undefined; label: string; printingLabel: string; className?: string }) {
  const [computer, setComputer] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => setComputer(effectiveMode(getPrintPrefs(), printerIp) === "computer"), [printerIp]);
  if (!computer)
    return (
      <a href={`/receipt/${id}?print=1`} target="_blank" className={className}>
        {label}
      </a>
    );
  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await printInFrame(`/receipt/${id}`);
        setBusy(false);
      }}
    >
      {busy ? printingLabel : label}
    </button>
  );
}
