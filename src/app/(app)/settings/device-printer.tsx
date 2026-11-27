"use client";

import { useEffect, useState } from "react";
import type { Dict } from "@/lib/i18n";
import { getPrintPrefs, helperCut, helperStatus, printInFrame, setPrintPrefs, type PrintMode, type PrintPrefs } from "@/lib/device-print";

/** Per-device printer choice, saved in this browser: the Windows till with its USB printer, a tablet on Wi-Fi, a phone with none. */
export default function DevicePrinter({ t, hasWifi }: { t: Dict; hasWifi: boolean }) {
  const [p, setP] = useState<PrintPrefs | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  // undefined = checking, null = not installed, string = printer the helper cuts on
  const [helper, setHelper] = useState<string | null | undefined>(undefined);
  useEffect(() => setP(getPrintPrefs()), []);
  const computer = p?.mode === "computer";
  useEffect(() => {
    if (computer) helperStatus().then(setHelper);
  }, [computer]);
  if (!p) return null;
  const save = (next: PrintPrefs) => {
    setP(next);
    setPrintPrefs(next);
    setMsg(t.saved);
  };
  const modes: { v: PrintMode; label: string }[] = [
    { v: "computer", label: t.printerComputer },
    { v: "wifi", label: t.printerWifiMode },
    { v: "auto", label: t.printerAutoMode },
    { v: "off", label: t.printerNone },
  ];
  return (
    <section className="card mt-4 space-y-3">
      <h2 className="eyebrow">{t.devicePrinter}</h2>
      <p className="muted text-xs">{t.devicePrinterHint}</p>
      <div className="space-y-2">
        {modes.map((m) => (
          <label key={m.v} className="flex items-start gap-2 text-sm font-medium">
            <input type="radio" name="device_print_mode" className="mt-1" checked={p.mode === m.v} disabled={m.v === "wifi" && !hasWifi} onChange={() => save({ ...p, mode: m.v })} />
            <span>{m.label}</span>
          </label>
        ))}
      </div>
      {p.mode === "computer" && (
        <>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={p.auto} onChange={(e) => save({ ...p, auto: e.target.checked })} /> {t.autoPrintAfterSale}
          </label>
          <label className="flex items-start gap-2 text-sm font-medium">
            <input type="checkbox" className="mt-1" checked={p.station} onChange={(e) => save({ ...p, station: e.target.checked })} />
            <span>
              {t.printStation}
              <span className="muted block text-xs font-normal">{t.printStationHint}</span>
            </span>
          </label>
          <label className="block">
            <span className="label">{t.feedBeforeCut}</span>
            <input
              type="number"
              min={0}
              max={80}
              step={1}
              inputMode="numeric"
              className="input num w-28"
              value={p.feed}
              onChange={(e) => save({ ...p, feed: Math.min(80, Math.max(0, Number(e.target.value) || 0)), feedSet: true })}
            />
          </label>
          <p className="muted text-xs">{t.feedBeforeCutHint}</p>
          <p className="muted text-xs">{t.kioskHint}</p>
          <div className="rounded-lg border border-bean-200 p-3 text-sm">
            <p className="font-semibold">{t.cutHelper}</p>
            <p className="muted text-xs">{helper === undefined ? "…" : helper ? `${t.cutHelperOn} ${helper}` : t.cutHelperOff}</p>
            {!helper && helper !== undefined && (
              <code className="mt-2 block select-all break-all rounded bg-black/5 p-2 text-xs">powershell -ExecutionPolicy Bypass -Command &quot;irm https://cups-app-omega.vercel.app/print-helper/install.ps1 | iex&quot;</code>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={async () => {
                setMsg(t.printing);
                setMsg((await printInFrame("/receipt/sample")) ? t.sentToPrinter : t.printFailed);
              }}
            >
              {t.testPrint}
            </button>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={async () => {
                const ok = await helperCut();
                setMsg(ok ? t.sentToPrinter : t.cutHelperOff);
                helperStatus().then(setHelper);
              }}
            >
              {t.testCut}
            </button>
            <a href="/receipt/sample" target="_blank" className="text-sm font-semibold text-accent-ink underline">{t.previewReceipt}</a>
          </div>
        </>
      )}
      {msg && <p className="text-sm">{msg}</p>}
    </section>
  );
}
