import { requireManager } from "@/lib/session";
import { missingTable, type Settings } from "@/lib/pos";
import { DbUpdateNeeded } from "@/components/db-update";
import { PageHeader } from "@/components/ui";
import SubmitButton from "@/components/submit-button";
import { saveSettings } from "./actions";
import TestPrint from "./test-print";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { supabase, t } = await requireManager();
  const sp = await searchParams;
  const { data, error } = await supabase.from("cafe_settings").select("*").maybeSingle();
  if (missingTable(error) || !data) return <DbUpdateNeeded text={t.dbUpdateNeeded} />;
  const s = data as Settings;
  const F = ({ k, label, dir, mode }: { k: keyof Settings; label: string; dir?: "rtl" | "ltr"; mode?: "decimal" }) => (
    <label className="block">
      <span className="label">{label}</span>
      <input name={k} defaultValue={(s[k] as string | number | null) ?? ""} dir={dir} inputMode={mode} className={`input ${mode ? "num" : ""}`} />
    </label>
  );
  return (
    <>
      <PageHeader title={t.posSettings} back="/more" />
      {sp.saved && <p className="card mb-3 text-green-700">✓ {t.saved}</p>}
      <form action={saveSettings} className="space-y-4">
        <section className="card space-y-3">
          <h2 className="eyebrow">{t.receiptHeader}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <F k="name" label={t.cafeName} />
            <F k="name_ar" label={t.nameAr} dir="rtl" />
            <F k="address" label={t.address} />
            <F k="address_ar" label={`${t.address} (AR)`} dir="rtl" />
            <F k="phone" label={t.phone} dir="ltr" />
            <F k="trn" label={t.trn} dir="ltr" />
            <F k="invoice_prefix" label={t.invoicePrefix} dir="ltr" />
            <F k="receipt_footer" label={t.receiptFooter} />
            <F k="receipt_footer_ar" label={`${t.receiptFooter} (AR)`} dir="rtl" />
          </div>
          <p className="muted text-xs">{t.trnHint}</p>
        </section>
        <section className="card space-y-3">
          <h2 className="eyebrow">{t.costRules}</h2>
          <div className="grid grid-cols-2 gap-3">
            <F k="target_cost_pct" label={t.targetCostPct} mode="decimal" />
            <F k="margin_alert_pct" label={t.marginAlertPct} mode="decimal" />
          </div>
        </section>
        {s.draw_enabled !== undefined && (
          <section className="card space-y-3">
            <h2 className="eyebrow">{t.prizeDraw}</h2>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" name="draw_enabled" defaultChecked={s.draw_enabled} /> {t.drawEnabled}
            </label>
            <F k="draw_min_total" label={t.drawMinTotal} mode="decimal" />
          </section>
        )}
        <section className="card space-y-3">
          <h2 className="eyebrow">{t.wifiPrinter}</h2>
          <F k="printer_ip" label={t.printerIp} dir="ltr" />
          <p className="muted text-xs">{t.printerHint}</p>
          {s.printer_ip && <TestPrint ip={s.printer_ip} labels={{ test: t.testPrint, ok: t.printed, fail: t.printFailed, sending: t.printing }} />}
        </section>
        <SubmitButton className="btn-primary w-full">{t.save}</SubmitButton>
      </form>
    </>
  );
}
