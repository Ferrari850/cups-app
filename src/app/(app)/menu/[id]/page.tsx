import Link from "next/link";
import { notFound } from "next/navigation";
import { requireManager } from "@/lib/session";
import { fmtAED, fmtNum } from "@/lib/format";
import { localName } from "@/lib/i18n";
import { PageHeader } from "@/components/ui";
import SubmitButton from "@/components/submit-button";
import { Icon } from "@/components/icons";
import { VAT, costPct, pctColor } from "@/lib/costing";
import { addRecipeLine, deleteMenuItem, deleteRecipeLine, setChannelPrices, setItemGroups, setMenuFlags, updateMenuItem, updateRecipeLine } from "../actions";
import { channelPrice, suggestedPrice, type Channel } from "@/lib/pos";
import MenuPhoto from "./photo";

type Line = {
  id: string;
  quantity: number;
  waste_pct: number;
  items: { id: string; name: string; name_ar: string | null; base_unit: string; unit_cost: number | null } | null;
};

export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, t, locale } = await requireManager();
  const [{ data: m }, { data: lineData }, { data: items }, { data: channels }, { data: fixed }, { data: groups }, { data: links }, { data: settings }] = await Promise.all([
    supabase.from("menu_items").select("*").eq("id", id).single(),
    supabase
      .from("recipe_lines")
      .select("id, quantity, waste_pct, items(id, name, name_ar, base_unit, unit_cost)")
      .eq("menu_item_id", id)
      .order("sort"),
    supabase.from("items").select("id, name, name_ar, base_unit, unit_cost").order("name"),
    // POS tables; empty until the POS database update has run.
    supabase.from("channels").select("*").eq("active", true).order("sort"),
    supabase.from("channel_prices").select("channel_id, price").eq("menu_item_id", id),
    supabase.from("modifier_groups").select("id, name, name_ar").order("sort").order("name"),
    supabase.from("menu_item_modifier_groups").select("group_id").eq("menu_item_id", id),
    supabase.from("cafe_settings").select("target_cost_pct").maybeSingle(),
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
  const fixedBy = new Map((fixed ?? []).map((f) => [f.channel_id, Number(f.price)]));
  const linked = new Set((links ?? []).map((l) => l.group_id));
  const suggested = lines.length && !missing ? suggestedPrice(cost, Number(settings?.target_cost_pct ?? 30)) : null;
  const tooCostly = pct != null && pct > 60;
  const oddQty = (l: Line) => (l.items?.base_unit === "pcs" ? Number(l.quantity) > 10 : Number(l.quantity) > 1500);
  const unitLabel = (u?: string) => (u === "g" ? t.unit_g : u === "ml" ? t.unit_ml : t.unit_pcs);

  return (
    <>
      <PageHeader title={localName(m, locale)} back="/menu" />
      {"image_url" in m && (
        <MenuPhoto id={id} url={m.image_url ?? null} labels={{ add: t.addPhoto, change: t.changePhoto, remove: t.delete, uploading: t.uploading }} />
      )}

      <div className="card mb-5 grid grid-cols-3 gap-2 p-3">
        <div className="tile">
          <div className="eyebrow truncate">{t.costPerPortion}</div>
          <div className="num mt-1 text-xl font-extrabold tracking-tight">{fmtAED(cost, locale)}</div>
        </div>
        <div className="tile">
          <div className="eyebrow truncate">{t.margin}</div>
          <div className="num mt-1 text-xl font-extrabold tracking-tight">{net != null && lines.length ? fmtAED(net - cost, locale) : "–"}</div>
        </div>
        <div className="tile">
          <div className="eyebrow truncate">{t.foodCost}</div>
          <div className={`num mt-1 text-xl font-extrabold tracking-tight ${pctColor(pct)}`}>{pct != null ? `${pct.toFixed(1)}%` : "–"}</div>
        </div>
        {missing && <p className="col-span-3 text-sm text-amber-800">⚠️ {t.missingPrices}</p>}
        {tooCostly && <p className="col-span-3 text-sm font-semibold text-red-700">⚠️ {t.recipeTooCostly}</p>}
        {lines.some(oddQty) && <p className="col-span-3 text-sm font-semibold text-red-700">⚠️ {t.checkQuantities}</p>}
        {suggested != null && (
          <p className="muted col-span-3 num">
            {t.suggestedPrice}: {fmtAED(suggested, locale)}
          </p>
        )}
        {net != null && (
          <p className="muted col-span-3 num">
            {t.priceExVat}: {fmtAED(net, locale)}
          </p>
        )}
      </div>

      <h2 className="eyebrow mb-2.5 px-1">{t.recipe}</h2>
      {lines.length === 0 && <p className="muted mb-3">{t.recipeEmpty}</p>}
      <form action={addRecipeLine} className="card mb-4 space-y-2 ring-2 ring-accent-soft">
        <input type="hidden" name="menu_item_id" value={id} />
        <label className="mb-1 block text-base font-bold">+ {t.addIngredient}</label>
        {(items ?? []).length === 0 && (
          <p className="text-sm text-amber-800">
            {t.noItemsYet}{" "}
            <Link href="/invoices/new" className="underline">{t.newInvoice}</Link>
          </p>
        )}
        <select name="item_id" required className="input" defaultValue="">
          <option value="" disabled>—</option>
          {(items ?? []).map((i) => (
            <option key={i.id} value={i.id}>
              {localName(i, locale)} ({unitLabel(i.base_unit)}){i.unit_cost != null ? ` · ${fmtAED(Number(i.unit_cost) * (i.base_unit === "pcs" ? 1 : 1000), locale)}/${i.base_unit === "pcs" ? unitLabel("pcs") : i.base_unit === "g" ? "kg" : "L"}` : ""}
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
                <span className="font-medium">
                  {l.items ? localName(l.items, locale) : "?"}
                  {oddQty(l) && <span className="ms-1 text-red-700" title={t.checkQuantities}>⚠️</span>}
                </span>
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

      {(channels ?? []).length > 0 && (
        <section className="card mb-4 space-y-4">
          <h2 className="eyebrow">{t.onTheTill}</h2>
          <form action={setMenuFlags} className="flex flex-wrap items-center gap-4 text-sm">
            <input type="hidden" name="id" value={id} />
            <label className="flex items-center gap-1.5"><input type="checkbox" name="active" defaultChecked={m.active ?? true} /> {t.showOnTill}</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" name="sold_out" defaultChecked={m.sold_out ?? false} /> {t.soldOut}</label>
            <SubmitButton className="btn-secondary btn-sm">{t.save}</SubmitButton>
          </form>
          <form action={setChannelPrices} className="space-y-2">
            <input type="hidden" name="id" value={id} />
            <div className="eyebrow">{t.channelPrices}</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {((channels ?? []) as Channel[]).map((c) => {
                const rule = channelPrice(m.selling_price == null ? null : Number(m.selling_price), c);
                return (
                  <label key={c.id} className="tile block">
                    <span className="block text-xs font-semibold text-bean-600">{localName(c, locale)}</span>
                    <input name={`p_${c.id}`} defaultValue={fixedBy.get(c.id) ?? ""} placeholder={rule != null ? rule.toFixed(2) : "–"} inputMode="decimal" className="input num mt-1 min-h-9" />
                  </label>
                );
              })}
            </div>
            <p className="muted text-xs">{t.channelPriceHint}</p>
            <SubmitButton className="btn-secondary btn-sm">{t.save}</SubmitButton>
          </form>
          {(groups ?? []).length > 0 && (
            <form action={setItemGroups} className="space-y-2">
              <input type="hidden" name="id" value={id} />
              <div className="eyebrow">{t.addons}</div>
              <div className="flex flex-wrap gap-3 text-sm">
                {(groups ?? []).map((g) => (
                  <label key={g.id} className="flex items-center gap-1.5">
                    <input type="checkbox" name="group" value={g.id} defaultChecked={linked.has(g.id)} /> {localName(g, locale)}
                  </label>
                ))}
              </div>
              <SubmitButton className="btn-secondary btn-sm">{t.save}</SubmitButton>
            </form>
          )}
        </section>
      )}

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
