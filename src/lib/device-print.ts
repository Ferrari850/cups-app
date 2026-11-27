"use client";

/**
 * Which receipt printer this device uses. Saved in the browser of each device (till, tablet),
 * because the printer is plugged into one device, not the whole cafe.
 *  - "auto": the old behaviour: Wi-Fi Epson if a printer IP is set, otherwise print by hand.
 *  - "computer": a printer installed on this computer (USB, e.g. E-POS ECO250 on the Windows till).
 *    Receipts print through the browser, silently when Chrome runs with --kiosk-printing.
 *  - "wifi": the Epson ePOS Wi-Fi printer in Settings.
 *  - "off": never print by itself.
 */
export type PrintMode = "auto" | "computer" | "wifi" | "off";
/** feed: blank paper (mm) after the receipt, so the whole receipt has passed the cutter before it cuts. */
export type PrintPrefs = { mode: PrintMode; auto: boolean; feed: number; station: boolean };
export const DEFAULT_FEED = 20;

const KEY = "cups.print";

export function getPrintPrefs(): PrintPrefs {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    if (v && ["auto", "computer", "wifi", "off"].includes(v.mode)) {
      const feed = Number(v.feed);
      return { mode: v.mode, auto: v.auto !== false, feed: Number.isFinite(feed) && feed >= 0 && feed <= 80 ? feed : DEFAULT_FEED, station: v.station === true };
    }
  } catch {}
  return { mode: "auto", auto: true, feed: DEFAULT_FEED, station: false };
}

export function setPrintPrefs(p: PrintPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {}
}

/** What actually happens on this device, given the cafe's Wi-Fi printer setting. */
export function effectiveMode(p: PrintPrefs, printerIp: string | null | undefined): "computer" | "wifi" | "off" {
  if (p.mode === "auto") return printerIp ? "wifi" : "off";
  if (p.mode === "wifi" && !printerIp) return "off";
  return p.mode;
}

/**
 * Prints a receipt page without leaving the till: the page loads in a hidden frame and prints itself.
 * With Chrome's --kiosk-printing there is no dialog, it goes straight to the Windows default printer.
 * Prints one at a time (the till and the print station can both ask at once).
 * Resolves true once the page has handed the receipt to the printer, false after 20 s without that.
 */
let queue: Promise<unknown> = Promise.resolve();
export function printInFrame(path: string): Promise<boolean> {
  const job = queue.then(() => printOne(path));
  queue = job.catch(() => false);
  return job;
}

function printOne(path: string): Promise<boolean> {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  // Not display:none: some browsers won't print a hidden frame.
  Object.assign(frame.style, { position: "fixed", left: "-10000px", top: "0", width: "400px", height: "800px", border: "0", visibility: "hidden" });
  const url = path + (path.includes("?") ? "&" : "?") + "print=1&embed=1";
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      window.removeEventListener("message", onMsg);
      // Leave the frame a moment so the print job finishes spooling, and space out back-to-back receipts.
      setTimeout(() => frame.remove(), 10000);
      setTimeout(() => resolve(ok), 800);
    };
    const onMsg = (e: MessageEvent) => {
      if (e.origin === location.origin && e.source === frame.contentWindow && e.data === "receipt-printed") finish(true);
    };
    window.addEventListener("message", onMsg);
    setTimeout(() => finish(false), 20000);
    frame.src = url;
    document.body.appendChild(frame);
  });
}

/* Print station: the till prints new orders from staff phones. Orders this device has already
   printed (or will print itself) are remembered here so nothing prints twice. */
const DONE_KEY = "cups.printed";
const SINCE_KEY = "cups.station.since";

function doneList(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(DONE_KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
export function wasPrinted(id: string) {
  return doneList().includes(id);
}
export function markPrinted(id: string) {
  try {
    const list = doneList().filter((x) => x !== id);
    list.push(id);
    localStorage.setItem(DONE_KEY, JSON.stringify(list.slice(-300)));
  } catch {}
}
/** Newest order time the station has handled. Starts at "now" (or up to 2 hours back after a reload). */
export function stationSince(): string {
  try {
    const v = localStorage.getItem(SINCE_KEY);
    if (v && Date.now() - Date.parse(v) < 2 * 3600_000) return v;
  } catch {}
  const now = new Date().toISOString();
  setStationSince(now);
  return now;
}
export function setStationSince(iso: string) {
  try {
    localStorage.setItem(SINCE_KEY, iso);
  } catch {}
}
