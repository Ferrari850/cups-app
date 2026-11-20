import { requireManager } from "@/lib/session";
import { fmtAED, fmtDate } from "@/lib/format";
import { localName } from "@/lib/i18n";
import { Empty, PageHeader, RowLink } from "@/components/ui";
import { createItem } from "./actions";

export default async function ItemsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { supabase, t, locale } = await requireManager();
  const q = (await searchParams).q?.trim() ?? "";
  let query = supabase.from("items").select("id, name, name_ar, category, base_unit, unit_cost, unit_cost_at").order("name");
  if (q) query = query.or(`name.ilike.%${q.replace(/[%,()]/g, "")}%,name_ar.ilike.%${q.replace(/[%,()]/g, "")}%`);
  const { data: items } = await query;

  return (
    <>
      <PageHeader title={t.items} back="/more" />
      <form className="mb-3">
        <input name="q" defaultValue={q} placeholder="🔍" className="input" />
      </form>
      <details className="card mb-4">
        <summary className="cursor-pointer font-medium">+ {t.newIngredient}</summary>
        <form action={createItem} className="mt-3 space-y-2">
          <input name="name" required placeholder={t.name} className="input" />
          <input name="name_ar" placeholder={t.nameAr} className="input" dir="rtl" />
          <div className="grid grid-cols-2 gap-2">
            <input name="category" placeholder={t.category} className="input" />
            <select name="base_unit" className="input" defaultValue="g">
              <option value="g">{t.unit_g}</option>
              <option value="ml">{t.unit_ml}</option>
              <option value="pcs">{t.unit_pcs}</option>
            </select>
          </div>
          <button className="btn-primary w-full">{t.add}</button>
        </form>
      </details>
      {items?.length ? (
        <ul className="space-y-2">
          {items.map((i) => (
            <li key={i.id}>
              <RowLink href={`/items/${i.id}`}>
                <div className="flex justify-between gap-2">
                  <span className="truncate font-medium">{localName(i, locale)}</span>
                  <span className="num shrink-0">
                    {i.unit_cost != null
                      ? `${fmtAED(Number(i.unit_cost) * (i.base_unit === "pcs" ? 1 : 1000), locale)} / ${i.base_unit === "pcs" ? t.unit_pcs : i.base_unit === "g" ? "kg" : "L"}`
                      : t.noPrice}
                  </span>
                </div>
                <div className="muted">
                  {i.category}
                  {i.unit_cost_at && ` · ${t.lastUpdated} ${fmtDate(i.unit_cost_at, locale)}`}
                </div>
              </RowLink>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>{t.none}</Empty>
      )}
    </>
  );
}
