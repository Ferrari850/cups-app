import Link from "next/link";
import { requireManager } from "@/lib/session";
import { fmtAED, fmtDate, fmtNum } from "@/lib/format";
import { localName } from "@/lib/i18n";
import { missingTable } from "@/lib/pos";
import { DbUpdateNeeded } from "@/components/db-update";
import { PageHeader, Panel } from "@/components/ui";
import SubmitButton from "@/components/submit-button";
import { recordWaste, setMinStock } from "./actions";

type Item = {
  id: string;
  name: string;
  name_ar: string | null;
  base_unit: string;
  unit_cost: number | null;
  min_stock: number | null;
  track_stock: boolean;
};

/** Stock on hand from invoices (in) and sales by recipe (out), with low-stock and re-order list. */
export default async function StockPage({ searchParams }: { searchParams: Promise<{ q?: string; counted?: string }> }) {
  const { supabase, t, locale } = await requireManager();
  const sp = await searchParams;
  const [items, stock, moves] = await Promise.all([
    supabase.from("items").select("id, name, name_ar, base_unit, unit_cost, min_stock, track_stock").order("name"),
    supabase.from("item_stock").select("item_id, on_hand, last_move"),
    supabase.from("stock_movements").select("id, qty, kind, note, created_at, items(name, name_ar, base_unit)").order("created_at", { ascending: false }).limit(40),
  ]);
  if (missingTable(stock.error) || missingTable(items.error)) return <DbUpdateNeeded text={t.dbUpdateNeeded} />;
  const onHand = new Map((stock.data ?? []).map((s) => [s.item_id, Number(s.on_hand)]));
  const all = ((items.data ?? []) as unknown as Item[]).filter(
    (i) => !sp.q || `${i.name} ${i.name_ar ?? ""}`.toLowerCase().includes(sp.q.toLowerCase()),
  );
  const low = all.filter((i) => i.track_stock && i.min_stock != null && (onHand.get(i.id) ?? 0) < Number(i.min_stock));
  const value = all.reduce((s, i) => s + Math.max(0, onHand.get(i.id) ?? 0) * Number(i.unit_cost ?? 0), 0);
  const unit = (u: string) => (u === "g" ? t.unit_g : u === "ml" ? t.unit_ml : t.unit_pcs);
  const qtyText = (n: number, u: string) =>
    u !== "pcs" && Math.abs(n) >= 1000 ? `${fmtNum(n / 1000, locale)} ${u === "g" ? "kg" : "L"}` : `${fmtNum(n, locale, 1)} ${unit(u)}`;

  const reorder = low
    .map((i) => `• ${i.name}: ${qtyText(onHand.get(i.id) ?? 0, i.base_unit)} (min ${qtyText(Number(i.min_stock), i.base_unit)})`)
    .join("\n");

  return (
    <>
      <PageHeader title={t.stock} back="/more" action={<Link href="/stock/count" className="btn-primary btn-sm">{t.stockCount}</Link>} />
      {sp.counted && <p className="card mb-3 text-green-700">✓ {t.countSaved} ({sp.counted})</p>}
      <div className="mb-4 grid grid-cols-2 gap-2">
        <div className="card p-3">
          <div className="eyebrow">{t.stockValue}</div>
          <div className="num mt-1 text-xl font-extrabold">{fmtAED(value, locale)}</div>
        </div>
        <div className={`card p-3 ${low.length ? "ring-1 ring-amber-300" : ""}`}>
          <div className="eyebrow">{t.lowStock}</div>
          <div className={`num mt-1 text-xl font-extrabold ${low.length ? "text-amber-700" : ""}`}>{low.length}</div>
        </div>
      </div>

      {low.length > 0 && (
        <Panel title={t.reorderList} className="mb-4" aside={<a className="font-semibold text-accent-ink" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`${t.reorderList}\n${reorder}`)}`}>WhatsApp</a>}>
          <pre className="whitespace-pre-wrap font-sans text-sm">{reorder}</pre>
        </Panel>
      )}

      <details className="card mb-4">
        <summary className="cursor-pointer font-semibold">{t.recordWaste}</summary>
        <form action={recordWaste} className="mt-3 space-y-2">
          <select name="item_id" required className="input" defaultValue="">
            <option value="" disabled>—</option>
            {all.map((i) => (
              <option key={i.id} value={i.id}>{localName(i, locale)} ({unit(i.base_unit)})</option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input name="qty" required inputMode="decimal" placeholder={t.quantity} className="input num" />
            <input name="note" placeholder={t.reason} className="input" />
          </div>
          <SubmitButton>{t.save}</SubmitButton>
        </form>
      </details>

      <form className="mb-3">
        <input name="q" defaultValue={sp.q} placeholder={t.search} className="input" />
      </form>
      <ul className="space-y-1.5">
        {all.map((i) => {
          const qty = onHand.get(i.id) ?? 0;
          const isLow = i.track_stock && i.min_stock != null && qty < Number(i.min_stock);
          return (
            <li key={i.id} className={`card p-3 ${isLow ? "ring-1 ring-amber-300" : ""} ${i.track_stock ? "" : "opacity-60"}`}>
              <div className="flex items-center justify-between gap-2">
                <Link href={`/items/${i.id}`} className="min-w-0 truncate font-semibold">{localName(i, locale)}</Link>
                <span className={`num shrink-0 font-extrabold ${qty < 0 ? "text-red-700" : isLow ? "text-amber-700" : ""}`}>{qtyText(qty, i.base_unit)}</span>
              </div>
              <form action={setMinStock} className="mt-1 flex items-center gap-2 text-xs text-bean-600">
                <input type="hidden" name="id" value={i.id} />
                <span>{t.minStock}</span>
                <input name="min_stock" defaultValue={i.min_stock ?? ""} inputMode="decimal" className="input num min-h-8 w-24 px-2 py-0 text-sm" />
                <span>{unit(i.base_unit)}</span>
                <label className="ms-auto flex items-center gap-1">
                  <input type="checkbox" name="track_stock" defaultChecked={i.track_stock} /> {t.trackStock}
                </label>
                <SubmitButton className="btn-secondary btn-sm">✓</SubmitButton>
              </form>
            </li>
          );
        })}
      </ul>

      <Panel title={t.stockMoves} className="mt-6">
        <ul className="divide-y divide-bean-100 text-sm">
          {((moves.data ?? []) as unknown as { id: string; qty: number; kind: string; note: string | null; created_at: string; items: { name: string; name_ar: string | null; base_unit: string } | null }[]).map((m) => (
            <li key={m.id} className="flex justify-between gap-2 py-1.5">
              <span className="min-w-0 truncate">
                {m.items ? localName(m.items, locale) : "?"} · <span className="text-bean-600">{t[`sk_${m.kind}` as "sk_sale"]}</span>
                {m.note && <span className="text-bean-500"> · {m.note}</span>}
              </span>
              <span className="shrink-0 text-end">
                <span className={`num font-semibold ${Number(m.qty) < 0 ? "text-red-700" : "text-green-700"}`}>
                  {Number(m.qty) > 0 ? "+" : ""}{m.items ? qtyText(Number(m.qty), m.items.base_unit) : m.qty}
                </span>
                <span className="muted ms-2 text-xs">{fmtDate(m.created_at, locale)}</span>
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}
