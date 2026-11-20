import { notFound } from "next/navigation";
import { requireManager } from "@/lib/session";
import { fmtAED, fmtNum } from "@/lib/format";
import { localName } from "@/lib/i18n";
import { PageHeader } from "@/components/ui";
import SubmitButton from "@/components/submit-button";
import { Icon } from "@/components/icons";
import { VAT, costPct, pctColor } from "@/lib/costing";
import { addRecipeLine, deleteMenuItem, deleteRecipeLine, updateMenuItem, updateRecipeLine } from "../actions";

type Line = {
  id: string;
  quantity: number;
  waste_pct: number;
  items: { id: string; name: string; name_ar: string | null; base_unit: string; unit_cost: number | null } | null;
};

export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, t, locale } = await requireManager();
  const [{ data: m }, { data: lineData }, { data: items }] = await Promise.all([
    supabase.from("menu_items").select("*").eq("id", id).single(),
    supabase
      .from("recipe_lines")
      .select("id, quantity, waste_pct, items(id, name, name_ar, base_unit, unit_cost)")
      .eq("menu_item_id", id)
      .order("sort"),
    supabase.from("items").select("id, name, name_ar, base_unit").order("name"),
  ]);
  if (!m) notFound();
  const lines = (lineData ?? []) as unknown as Line[];

  const lineCost = (l: Line) =>
    l.items?.unit_cost != null ? Number(l.quantity) * (1 + Number(l.waste_pct) / 100) * Number(l.items.unit_cost) : null;
  const batch = lines.reduce((s, l) => s + (lineCost(l) ?? 0), 0);
  const portions = Number(m.yield_portions) || 1;
  const cost = batch / portions;
  const missing = lines.some((l) => lineCost(l) == null);
  const pct = lines.length ? costPct(cost, m.selling_price) : null;
  const net = m.selling_price ? Number(m.selling_price) / (1 + VAT) : null;
  const unitLabel = (u?: string) => (u === "g" ? t.unit_g : u === "ml" ? t.unit_ml : t.unit_pcs);

  return (
    <>
      <PageHeader title={localName(m, locale)} back="/menu" />

      <div className="card mb-4 grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="muted">{t.costPerPortion}</div>
          <div className="num text-xl font-bold">{fmtAED(cost, locale)}</div>
        </div>
        <div>
          <div className="muted">{t.margin}</div>
          <div className="num text-xl font-bold">{net != null ? fmtAED(net - cost, locale) : "–"}</div>
        </div>
        <div>
          <div className="muted">{t.foodCost}</div>
          <div className={`num text-xl font-bold ${pctColor(pct)}`}>{pct != null ? `${pct.toFixed(1)}%` : "–"}</div>
        </div>
        {missing && <p className="col-span-3 text-sm text-amber-800">⚠️ {t.missingPrices}</p>}
        {net != null && (
          <p className="muted col-span-3 num">
            {t.priceExVat}: {fmtAED(net, locale)}
          </p>
        )}
      </div>

      <h2 className="h2 mb-2">{t.recipe}</h2>
      <ul className="mb-3 space-y-2">
        {lines.map((l) => {
          const c = lineCost(l);
          return (
            <li key={l.id} className="card">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="font-medium">{l.items ? localName(l.items, locale) : "?"}</span>
                <span className="num font-semibold">{c != null ? fmtAED(c, locale, 3) : t.noPrice}</span>
              </div>
              <form action={updateRecipeLine} className="flex items-center gap-2">
                <input type="hidden" name="id" value={l.id} />
                <input type="hidden" name="menu_item_id" value={id} />
                <input name="quantity" defaultValue={l.quantity} inputMode="decimal" className="input num min-h-9 w-24" />
                <span className="text-sm">{unitLabel(l.items?.base_unit)}</span>
                <input name="waste_pct" defaultValue={l.waste_pct || ""} inputMode="decimal" placeholder={t.waste} className="input num min-h-9 w-20" />
                <SubmitButton className="btn-secondary btn-sm">✓</SubmitButton>
                <button formAction={deleteRecipeLine} className="ms-auto p-1 text-bean-300 hover:text-red-600" aria-label={t.delete}>
                  <Icon name="trash" className="h-4 w-4" />
                </button>
              </form>
            </li>
          );
        })}
      </ul>

      <form action={addRecipeLine} className="card mb-6 space-y-2">
        <input type="hidden" name="menu_item_id" value={id} />
        <label className="label">{t.addIngredient}</label>
        <select name="item_id" required className="input" defaultValue="">
          <option value="" disabled>—</option>
          {(items ?? []).map((i) => (
            <option key={i.id} value={i.id}>
              {localName(i, locale)} ({unitLabel(i.base_unit)})
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <input name="quantity" required inputMode="decimal" placeholder={t.quantity} className="input num" />
          <input name="waste_pct" inputMode="decimal" placeholder={`${t.waste} (${t.optional})`} className="input num" />
        </div>
        <SubmitButton>{t.add}</SubmitButton>
      </form>

      <details className="card">
        <summary className="cursor-pointer font-medium">{t.edit}</summary>
        <form action={updateMenuItem} className="mt-3 space-y-2">
          <input type="hidden" name="id" value={id} />
          <input name="name" defaultValue={m.name} required className="input" />
          <input name="name_ar" defaultValue={m.name_ar ?? ""} placeholder={t.nameAr} className="input" dir="rtl" />
          <div className="grid grid-cols-2 gap-2">
            <input name="category" defaultValue={m.category ?? ""} placeholder={t.category} className="input" />
            <div>
              <input name="selling_price" defaultValue={m.selling_price ?? ""} inputMode="decimal" className="input num" />
              <span className="muted text-xs">{t.sellingPrice}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            {t.makes}
            <input name="yield_portions" defaultValue={m.yield_portions} inputMode="decimal" className="input num min-h-9 w-20" />
            {t.portions}
          </div>
          <textarea name="notes" defaultValue={m.notes ?? ""} placeholder={t.notes} rows={2} className="input py-2" />
          <SubmitButton>{t.save}</SubmitButton>
        </form>
        <form action={deleteMenuItem} className="mt-4">
          <input type="hidden" name="id" value={id} />
          <SubmitButton className="btn-danger btn-sm" confirmText={t.areYouSure}>{t.delete}</SubmitButton>
        </form>
      </details>
      <p className="muted mt-4 text-center num">
        {fmtNum(portions, locale)} {t.portions} · {t.total} {fmtAED(batch, locale)}
      </p>
    </>
  );
}
