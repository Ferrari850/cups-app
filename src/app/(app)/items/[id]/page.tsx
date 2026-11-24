import Link from "next/link";
import { notFound } from "next/navigation";
import { requireManager } from "@/lib/session";
import { fmtAED, fmtDate } from "@/lib/format";
import { localName } from "@/lib/i18n";
import { PageHeader } from "@/components/ui";
import SubmitButton from "@/components/submit-button";
import { deleteItem, updateItem } from "../actions";

type H = { id: string; unit_cost: number; invoice_unit_price: number | null; invoice_unit: string | null; recorded_on: string; invoice_id: string | null; suppliers: { name: string } | null };

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, t, locale } = await requireManager();
  const [{ data: item }, { data }] = await Promise.all([
    supabase.from("items").select("*").eq("id", id).single(),
    supabase
      .from("price_history")
      .select("id, unit_cost, invoice_unit_price, invoice_unit, recorded_on, invoice_id, suppliers(name)")
      .eq("item_id", id)
      .order("recorded_on", { ascending: false })
      .limit(50),
  ]);
  if (!item) notFound();
  const history = (data ?? []) as unknown as H[];
  const mult = item.base_unit === "pcs" ? 1 : 1000;
  const per = item.base_unit === "pcs" ? t.unit_pcs : item.base_unit === "g" ? "kg" : "L";

  // Tiny sparkline of the last prices (oldest -> newest)
  const pts = [...history].reverse().map((h) => Number(h.unit_cost));
  const min = Math.min(...pts), max = Math.max(...pts);
  const path = pts.length > 1
    ? pts.map((v, i) => `${(i / (pts.length - 1)) * 300},${max === min ? 30 : 55 - ((v - min) / (max - min)) * 50}`).join(" ")
    : "";

  return (
    <>
      <PageHeader title={localName(item, locale)} back="/items" />
      <div className="card mb-4 text-center">
        <div className="muted">{t.currentCost}</div>
        <div className="num text-3xl font-bold text-bean-800">
          {item.unit_cost != null ? fmtAED(Number(item.unit_cost) * mult, locale) : "–"}
          <span className="text-base font-normal"> / {per}</span>
        </div>
        {item.unit_cost_at && <div className="muted">{t.lastUpdated} {fmtDate(item.unit_cost_at, locale, { year: "numeric" })}</div>}
        {path && (
          <svg viewBox="0 0 300 60" className="mt-3 h-16 w-full" preserveAspectRatio="none" style={{ direction: "ltr" }}>
            <polyline points={path} fill="none" stroke="#8a5a2e" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </svg>
        )}
      </div>

      <h2 className="h2 mb-2">{t.priceHistory}</h2>
      <ul className="card mb-4 divide-y divide-bean-100 p-0">
        {history.map((h, i) => {
          const prev = history[i + 1];
          const pct = prev ? ((h.unit_cost - prev.unit_cost) / prev.unit_cost) * 100 : 0;
          return (
            <li key={h.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
              <div>
                <div className="num">{fmtDate(h.recorded_on, locale, { year: "numeric" })}</div>
                <div className="muted">{h.suppliers?.name}</div>
              </div>
              <div className="num text-end">
                <div className="font-medium">{fmtAED(h.unit_cost * mult, locale)} / {per}</div>
                {Math.abs(pct) >= 0.5 && (
                  <div className={pct > 0 ? "text-red-700" : "text-green-700"}>{pct > 0 ? "▲ +" : "▼ "}{pct.toFixed(1)}%</div>
                )}
                {h.invoice_id && <Link href={`/invoices/${h.invoice_id}`} className="text-xs text-bean-500 underline">{h.invoice_unit_price} / {h.invoice_unit}</Link>}
              </div>
            </li>
          );
        })}
        {history.length === 0 && <li className="muted px-4 py-3">{t.noPrice}</li>}
      </ul>

      <details className="card">
        <summary className="cursor-pointer font-medium">{t.edit}</summary>
        <form action={updateItem} className="mt-3 space-y-2">
          <input type="hidden" name="id" value={id} />
          <input name="name" defaultValue={item.name} required className="input" />
          <input name="name_ar" defaultValue={item.name_ar ?? ""} placeholder={t.nameAr} className="input" dir="rtl" />
          <div className="grid grid-cols-2 gap-2">
            <input name="category" defaultValue={item.category ?? ""} placeholder={t.category} className="input" />
            <select name="base_unit" defaultValue={item.base_unit} className="input">
              <option value="g">{t.unit_g}</option>
              <option value="ml">{t.unit_ml}</option>
              <option value="pcs">{t.unit_pcs}</option>
            </select>
          </div>
          <label className="label">{t.currentCost} (AED / {per}) <span className="muted">({t.optional})</span></label>
          <input name="manual_price" inputMode="decimal" className="input num" />
          <SubmitButton>{t.save}</SubmitButton>
        </form>
        <form action={deleteItem} className="mt-4">
          <input type="hidden" name="id" value={id} />
          <SubmitButton className="btn-danger btn-sm" confirmText={t.areYouSure}>{t.delete}</SubmitButton>
        </form>
      </details>
    </>
  );
}
