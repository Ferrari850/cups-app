"use client";

import { useEffect } from "react";
import { getPrintPrefs } from "@/lib/device-print";

/** Fits the page to the receipt (80 mm wide, as long as the receipt) so the roll isn't wasted. */
function fitPage() {
  const el = document.querySelector<HTMLElement>(".receipt");
  if (!el) return;
  // Blank paper after the receipt: the cutter sits above the print head, so without it the cut lands
  // inside the receipt and the end stays in the printer. Set per device in Settings.
  const feed = getPrintPrefs().feed;
  el.style.setProperty("--tail", `${feed}mm`);
  // Measured on screen, where the tail is hidden and the receipt has 9 mm of padding that print drops.
  // A little slack (3 mm) so the receipt never spills onto a second page, which would cut it twice.
  const mm = Math.ceil((el.scrollHeight * 25.4) / 96) - 9 + feed + 3;
  let tag = document.getElementById("receipt-page") as HTMLStyleElement | null;
  if (!tag) {
    tag = document.createElement("style");
    tag.id = "receipt-page";
    document.head.appendChild(tag);
  }
  tag.textContent = `@page { size: 80mm ${mm}mm; margin: 0; }`;
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
