import { requireManager } from "@/lib/session";
import { fmtAED } from "@/lib/format";
import { localName } from "@/lib/i18n";
import { missingTable } from "@/lib/pos";
import { DbUpdateNeeded } from "@/components/db-update";
import { Empty, PageHeader } from "@/components/ui";
import SubmitButton from "@/components/submit-button";
import { Icon } from "@/components/icons";
import { attachToCategory, deleteGroup, deleteOption, saveGroup, saveOption } from "./actions";

type Opt = { id: string; group_id: string; name: string; name_ar: string | null; price_delta: number; item_id: string | null; quantity: number | null; no_stock: boolean };

/** Add-ons (milk type, beans, extra acai…). Every add-on uses stock or is marked "no stock". */
export default async function AddonsPage() {
  const { supabase, t, locale } = await requireManager();
  const [groups, options, items, links, menu] = await Promise.all([
    supabase.from("modifier_groups").select("*").order("sort").order("name"),
    supabase.from("modifier_options").select("*").order("sort").order("name"),
    supabase.from("items").select("id, name, name_ar, base_unit, unit_cost").order("name"),
    supabase.from("menu_item_modifier_groups").select("group_id"),
    supabase.from("menu_items").select("category"),
  ]);
  if (missingTable(groups.error)) return <DbUpdateNeeded text={t.dbUpdateNeeded} />;
  const opts = (options.data ?? []) as Opt[];
  const itemById = new Map((items.data ?? []).map((i) => [i.id, i]));
  const usedBy = new Map<string, number>();
  for (const l of links.data ?? []) usedBy.set(l.group_id, (usedBy.get(l.group_id) ?? 0) + 1);
  const cats = [...new Set((menu.data ?? []).map((m) => m.category).filter(Boolean))] as string[];
  const unit = (u?: string) => (u === "g" ? t.unit_g : u === "ml" ? t.unit_ml : t.unit_pcs);

  const OptionFields = ({ o, groupId }: { o?: Opt; groupId: string }) => (
    <>
      <input type="hidden" name="group_id" value={groupId} />
      {o && <input type="hidden" name="id" value={o.id} />}
      <div className="grid grid-cols-2 gap-2">
        <input name="name" required defaultValue={o?.name} placeholder={t.name} className="input" />
        <input name="name_ar" defaultValue={o?.name_ar ?? ""} placeholder={t.nameAr} dir="rtl" className="input" />
        <input name="price_delta" defaultValue={o?.price_delta ?? ""} inputMode="decimal" placeholder={t.extraPrice} className="input num" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="no_stock" defaultChecked={o?.no_stock} /> {t.noStock}
        </label>
        <select name="item_id" defaultValue={o?.item_id ?? ""} className="input">
          <option value="">{t.usesStockItem}…</option>
          {(items.data ?? []).map((i) => (
            <option key={i.id} value={i.id}>{localName(i, locale)} ({unit(i.base_unit)})</option>
          ))}
        </select>
        <input name="quantity" defaultValue={o?.quantity ?? ""} inputMode="decimal" placeholder={t.quantity} className="input num" />
      </div>
    </>
  );

  return (
    <>
      <PageHeader title={t.addons} back="/more" />
      <p className="muted mb-3">{t.addonsHint}</p>
      <details className="card mb-4">
        <summary className="cursor-pointer font-semibold">+ {t.newAddonGroup}</summary>
        <form action={saveGroup} className="mt-3 grid grid-cols-2 gap-2">
          <input name="name" required placeholder={t.addonGroupName} className="input col-span-2" />
          <input name="name_ar" placeholder={t.nameAr} dir="rtl" className="input col-span-2" />
          <label className="text-sm">{t.minPick}<input name="min_select" defaultValue="0" inputMode="numeric" className="input num" /></label>
          <label className="text-sm">{t.maxPick}<input name="max_select" defaultValue="1" inputMode="numeric" className="input num" /></label>
          <SubmitButton className="btn-primary col-span-2">{t.add}</SubmitButton>
        </form>
      </details>
      {(groups.data ?? []).length === 0 && <Empty>{t.none}</Empty>}
      <div className="space-y-4">
        {(groups.data ?? []).map((g) => (
          <section key={g.id} className="card space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="h2">{localName(g, locale)}</h2>
                <p className="muted text-xs">
                  {t.minPick} {g.min_select} · {t.maxPick} {g.max_select} · {t.usedOnItems}: {usedBy.get(g.id) ?? 0}
                </p>
              </div>
              <form action={deleteGroup}>
                <input type="hidden" name="id" value={g.id} />
                <SubmitButton className="p-1 text-bean-300 hover:text-red-600" confirmText={t.areYouSure}>
                  <Icon name="trash" className="h-4 w-4" />
                </SubmitButton>
              </form>
            </div>
            <ul className="space-y-2">
              {opts.filter((o) => o.group_id === g.id).map((o) => {
                const it = o.item_id ? itemById.get(o.item_id) : null;
                const cost = it?.unit_cost != null && o.quantity ? Number(it.unit_cost) * Number(o.quantity) : null;
                return (
                  <li key={o.id} className="tile">
                    <details>
                      <summary className="flex cursor-pointer items-center justify-between gap-2">
                        <span className="font-semibold">
                          {localName(o, locale)}
                          {!o.item_id && !o.no_stock && <span className="ms-1 text-amber-700" title={t.addonNoStockWarn}>⚠️</span>}
                        </span>
                        <span className="num text-sm">
                          +{fmtAED(o.price_delta, locale)}
                          {cost != null && <span className="muted ms-1 text-xs">({t.cost} {fmtAED(cost, locale)})</span>}
                        </span>
                      </summary>
                      <form action={saveOption} className="mt-2 space-y-2">
                        <OptionFields o={o} groupId={g.id} />
                        <div className="flex gap-2">
                          <SubmitButton className="btn-primary btn-sm">{t.save}</SubmitButton>
                          <button formAction={deleteOption} className="btn-danger btn-sm">{t.delete}</button>
                        </div>
                      </form>
                    </details>
                  </li>
                );
              })}
            </ul>
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-accent-ink">+ {t.addOption}</summary>
              <form action={saveOption} className="mt-2 space-y-2">
                <OptionFields groupId={g.id} />
                <SubmitButton className="btn-primary btn-sm">{t.add}</SubmitButton>
              </form>
            </details>
            {cats.length > 0 && (
              <form action={attachToCategory} className="flex gap-2">
                <input type="hidden" name="group_id" value={g.id} />
                <select name="category" className="input min-h-9 text-sm">
                  {cats.map((c) => <option key={c}>{c}</option>)}
                </select>
                <SubmitButton className="btn-secondary btn-sm shrink-0">{t.attachToCategory}</SubmitButton>
              </form>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
