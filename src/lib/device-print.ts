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
export type PrintPrefs = { mode: PrintMode; auto: boolean };

const KEY = "cups.print";

export function getPrintPrefs(): PrintPrefs {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    if (v && ["auto", "computer", "wifi", "off"].includes(v.mode)) return { mode: v.mode, auto: v.auto !== false };
  } catch {}
  return { mode: "auto", auto: true };
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
 * Resolves true once the page has handed the receipt to the printer, false after 20 s without that.
 */
export function printInFrame(path: string): Promise<boolean> {
  document.getElementById("receipt-frame")?.remove();
  const frame = document.createElement("iframe");
  frame.id = "receipt-frame";
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
      resolve(ok);
      // Leave the frame a moment so the print job finishes spooling.
      setTimeout(() => frame.remove(), 5000);
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
