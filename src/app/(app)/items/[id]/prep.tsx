import Link from "next/link";
import { requireManager } from "@/lib/session";
import { fmtAED, fmtNum } from "@/lib/format";
import { localName } from "@/lib/i18n";
import { Icon } from "@/components/icons";
import SubmitButton from "@/components/submit-button";
import { addPrepLine, deletePrepLine, makeBatch, sellOnMenu, setPrepSettings, updatePrepLine } from "../actions";

type Ing = { id: string; name: string; name_ar: string | null; base_unit: string; unit_cost: number | null; is_prep?: boolean; prep_missing?: number };
type Line = { id: string; quantity: number; waste_pct: number; items: Ing | null };
type Item = Ing & { batch_yield: number | null; track_stock: boolean; category: string | null };

/** Homemade item: batch recipe, yield, stock mode, batches made, where it is used, sell on menu. */
export default async function PrepSection({ item, sp }: { item: Item; sp: { err?: string; batch?: string } }) {
  const { supabase, t, locale } = await requireManager();
  const id = item.id;
  const [{ data: lineData }, { data: all }, { data: inMenu }, { data: inPrep }, { data: stock }] = await Promise.all([
    supabase.from("prep_lines").select("id, quantity, waste_pct, items!prep_lines_item_id_fkey(id, name, name_ar, base_unit, unit_cost, is_prep, prep_missing)").eq("prep_id", id).order("sort"),
    supabase.from("items").select("id, name, name_ar, base_unit, unit_cost, is_prep").neq("id", id).order("name"),
    supabase.from("recipe_lines").select("quantity, menu_items(id, name, name_ar)").eq("item_id", id),
    supabase.from("prep_lines").select("quantity, items!prep_lines_prep_id_fkey(id, name, name_ar)").eq("item_id", id),
    supabase.from("item_stock").select("on_hand").eq("item_id", id).maybeSingle(),
  ]);
  const lines = (lineData ?? []) as unknown as Line[];
  const ings = (all ?? []) as Ing[];
  const unitLabel = (u?: string) => (u === "g" ? t.unit_g : u === "ml" ? t.unit_ml : t.unit_pcs);
  const mult = item.base_unit === "pcs" ? 1 : 1000;
  const per = item.base_unit === "pcs" ? t.unit_pcs : item.base_unit === "g" ? "kg" : "L";
  const priceText = (i: Ing) =>
    i.unit_cost != null ? ` · ${fmtAED(Number(i.unit_cost) * (i.base_unit === "pcs" ? 1 : 1000), locale)}/${i.base_unit === "pcs" ? unitLabel("pcs") : i.base_unit === "g" ? "kg" : "L"}` : "";
  const lineCost = (l: Line) =>
    l.items?.unit_cost != null ? Number(l.quantity) * (1 + Number(l.waste_pct) / 100) * Number(l.items.unit_cost) : null;
  const batchCost = lines.reduce((s, l) => s + (lineCost(l) ?? 0), 0);
  const missing = lines.some((l) => lineCost(l) == null || Number(l.items?.prep_missing ?? 0) > 0);
  const yieldQty = Number(item.batch_yield ?? 0);
  const usedMenu = (inMenu ?? []) as unknown as { quantity: number; menu_items: { id: string; name: string; name_ar: string | null } | null }[];
  const usedPrep = (inPrep ?? []) as unknown as { quantity: number; items: { id: string; name: string; name_ar: string | null } | null }[];
  const onHand = Number(stock?.on_hand ?? 0);
  const qtyText = (n: number, u: string) =>
    u !== "pcs" && Math.abs(n) >= 1000 ? `${fmtNum(n / 1000, locale)} ${u === "g" ? "kg" : "L"}` : `${fmtNum(n, locale, 1)} ${unitLabel(u)}`;

  return (
    <>
      <p className="muted mb-4 text-sm">{t.homemadeHint}</p>
      {sp.err === "cycle" && <p className="card mb-3 text-red-700">⚠️ {t.prepCycle}</p>}
      {sp.batch && <p className="card mb-3 text-green-700">✓ {t.batchSaved}</p>}

      <form action={setPrepSettings} className="card mb-4 space-y-3">
        <input type="hidden" name="id" value={id} />
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          {t.oneBatchMakes}
          <input name="batch_yield" defaultValue={item.batch_yield ?? ""} inputMode="decimal" required className="input num min-h-9 w-28" />
          {unitLabel(item.base_unit)}
        </div>
        {!yieldQty && <p className="text-sm text-amber-800">⚠️ {t.setYieldFirst}</p>}
        <fieldset className="space-y-1.5 text-sm">
          <legend className="eyebrow mb-1">{t.stockMode}</legend>
          <label className="flex items-start gap-2">
            <input type="radio" name="stock_mode" value="direct" defaultChecked={!item.track_stock} className="mt-1" /> {t.stockModeDirect}
          </label>
          <label className="flex items-start gap-2">
            <input type="radio" name="stock_mode" value="batch" defaultChecked={item.track_stock} className="mt-1" /> {t.stockModeBatch}
          </label>
        </fieldset>
        <SubmitButton className="btn-secondary btn-sm">{t.save}</SubmitButton>
      </form>

      <h2 className="eyebrow mb-2.5 px-1">{t.batchRecipe}</h2>
      {lines.length === 0 && <p className="muted mb-3">{t.batchRecipeEmpty}</p>}
      <form action={addPrepLine} className="card mb-4 space-y-2 ring-2 ring-accent-soft">
        <input type="hidden" name="prep_id" value={id} />
        <label className="mb-1 block text-base font-bold">+ {t.addIngredient}</label>
        <select name="item_id" required className="input" defaultValue="">
          <option value="" disabled>—</option>
          {ings.map((i) => (
            <option key={i.id} value={i.id}>
              {i.is_prep ? "🏠 " : ""}{localName(i, locale)} ({unitLabel(i.base_unit)}){priceText(i)}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <input name="quantity" required inputMode="decimal" placeholder={t.quantity} className="input num" />
          <input name="waste_pct" inputMode="decimal" placeholder={`${t.waste} (${t.optional})`} className="input num" />
        </div>
        <SubmitButton>{t.add}</SubmitButton>
      </form>

      <ul className="mb-3 space-y-2">
        {lines.map((l) => {
          const c = lineCost(l);
          return (
            <li key={l.id} className="card">
              <div className="mb-2 flex items-center justify-between gap-2">
                {l.items ? (
                  <Link href={`/items/${l.items.id}`} className="font-medium">{l.items.is_prep ? "🏠 " : ""}{localName(l.items, locale)}</Link>
                ) : (
                  <span>?</span>
                )}
                <span className="num font-semibold">{c != null ? fmtAED(c, locale, 3) : t.noPrice}</span>
              </div>
              <form action={updatePrepLine} className="flex items-center gap-2">
                <input type="hidden" name="id" value={l.id} />
                <input type="hidden" name="prep_id" value={id} />
                <input name="quantity" defaultValue={l.quantity} inputMode="decimal" className="input num min-h-9 w-24" />
                <span className="text-sm">{unitLabel(l.items?.base_unit)}</span>
                <input name="waste_pct" defaultValue={l.waste_pct || ""} inputMode="decimal" placeholder={t.waste} className="input num min-h-9 w-20" />
                <SubmitButton className="btn-secondary btn-sm">✓</SubmitButton>
                <button formAction={deletePrepLine} className="ms-auto p-1 text-bean-300 hover:text-red-600" aria-label={t.delete}>
                  <Icon name="trash" className="h-4 w-4" />
                </button>
              </form>
            </li>
          );
        })}
      </ul>
      {lines.length > 0 && (
        <div className="card mb-4 space-y-1 text-sm">
          <div className="flex justify-between"><span>{t.batchCost}</span><span className="num font-semibold">{fmtAED(batchCost, locale)}</span></div>
          {yieldQty > 0 && (
            <div className="flex justify-between">
              <span>{t.currentCost}</span>
              <span className="num font-semibold">{fmtAED((batchCost / yieldQty) * mult, locale)} / {per}</span>
            </div>
          )}
          {missing && <p className="text-amber-800">⚠️ {t.missingPrices}</p>}
        </div>
      )}

      {item.track_stock && (
        <form action={makeBatch} className="card mb-4 space-y-2">
          <input type="hidden" name="id" value={id} />
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold">{t.madeBatch}</span>
            <span className={`num text-sm font-semibold ${onHand < 0 ? "text-red-700" : "text-bean-600"}`}>{t.stock}: {qtyText(onHand, item.base_unit)}</span>
          </div>
          <p className="muted text-xs">{t.madeBatchHint}</p>
          <div className="flex items-center gap-2 text-sm">
            <input name="batches" defaultValue="1" inputMode="decimal" className="input num min-h-9 w-20" />
            <span>{t.batches}{yieldQty > 0 && ` (× ${qtyText(yieldQty, item.base_unit)})`}</span>
            <input name="note" placeholder={t.notes} className="input min-h-9 flex-1" />
          </div>
          <SubmitButton className="btn-primary btn-sm" >{t.save}</SubmitButton>
        </form>
      )}

      <section className="card mb-4">
        <h2 className="eyebrow mb-2">{t.usedIn}</h2>
        {usedMenu.length + usedPrep.length === 0 && <p className="muted text-sm">{t.notUsedYet}</p>}
        <ul className="space-y-1 text-sm">
          {usedMenu.map((u, i) => u.menu_items && (
            <li key={`m${i}`} className="flex justify-between gap-2">
              <Link href={`/menu/${u.menu_items.id}`} className="underline">{localName(u.menu_items, locale)}</Link>
              <span className="num text-bean-600">{fmtNum(Number(u.quantity), locale)} {unitLabel(item.base_unit)}</span>
            </li>
          ))}
          {usedPrep.map((u, i) => u.items && (
            <li key={`p${i}`} className="flex justify-between gap-2">
              <Link href={`/items/${u.items.id}`} className="underline">🏠 {localName(u.items, locale)}</Link>
              <span className="num text-bean-600">{fmtNum(Number(u.quantity), locale)} {unitLabel(item.base_unit)}</span>
            </li>
          ))}
        </ul>
      </section>

      <details className="card mb-4">
        <summary className="cursor-pointer font-medium">+ {t.sellOnMenu}</summary>
        <p className="muted mt-2 text-xs">{t.sellOnMenuHint}</p>
        <form action={sellOnMenu} className="mt-3 space-y-2">
          <input type="hidden" name="id" value={id} />
          <input name="name" required defaultValue={item.name} placeholder={t.name} className="input" />
          <input name="name_ar" defaultValue={item.name_ar ?? ""} placeholder={t.nameAr} className="input" dir="rtl" />
          <div className="grid grid-cols-2 gap-2">
            <input name="category" placeholder={t.category} className="input" />
            <input name="selling_price" inputMode="decimal" placeholder={t.sellingPrice} className="input num" />
          </div>
          <div className="flex items-center gap-2 text-sm">
            {t.portionSize}
            <input name="quantity" required inputMode="decimal" className="input num min-h-9 w-24" />
            {unitLabel(item.base_unit)}
          </div>
          <SubmitButton>{t.createMenuItem}</SubmitButton>
        </form>
      </details>
    </>
  );
}
