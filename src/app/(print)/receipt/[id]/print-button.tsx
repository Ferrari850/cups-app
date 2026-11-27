"use client";

import { useEffect } from "react";
import { getPrintPrefs } from "@/lib/device-print";

/**
 * Print setup for the receipt. The page uses the printer's own paper (pick the 80 mm roll size in the
 * driver / print dialog) with no margins, so Chrome prints no headers or footers and starts at the top.
 * A fixed CSS page height didn't work: Chrome shrinks and centres it on the driver's paper instead.
 */
function fitPage() {
  const el = document.querySelector<HTMLElement>(".receipt");
  if (!el) return;
  // Blank paper after the receipt: the cutter sits above the print head, so without it the cut lands
  // inside the receipt and the end stays in the printer. Set per device in Settings.
  const feed = getPrintPrefs().feed;
  el.style.setProperty("--tail", `${feed}mm`);
  let tag = document.getElementById("receipt-page") as HTMLStyleElement | null;
  if (!tag) {
    tag = document.createElement("style");
    tag.id = "receipt-page";
    document.head.appendChild(tag);
  }
  tag.textContent = "@page { size: auto; margin: 0; }";
}

function printNow(embed: boolean) {
  fitPage();
  window.print();
  // In the till's hidden frame: tell the till it went to the printer.
  if (embed) window.parent.postMessage("receipt-printed", location.origin);
}

export default function PrintButton({ label, auto, embed }: { label: string; auto?: boolean; embed?: boolean }) {
  useEffect(() => {
    fitPage();
    if (!auto) return;
    // Wait for fonts (Arabic) so the first print isn't missing letters.
    let cancelled = false;
    const go = () => !cancelled && printNow(!!embed);
    (document.fonts?.ready ?? Promise.resolve()).then(() => requestAnimationFrame(() => setTimeout(go, 50)));
    return () => {
      cancelled = true;
    };
  }, [auto, embed]);
  if (embed) return null;
  return (
    <button type="button" className="btn-primary w-full" onClick={() => printNow(false)}>
      {label}
    </button>
  );
}
