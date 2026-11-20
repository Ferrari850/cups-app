import { requireManager } from "@/lib/session";
import { fmtAED } from "@/lib/format";
import { localName } from "@/lib/i18n";
import { Empty, PageHeader, RowLink } from "@/components/ui";
import { createMenuItem } from "./actions";
import { costPct, pctColor } from "@/lib/costing";

type Row = { id: string; name: string; name_ar: string | null; category: string | null; selling_price: number | null };
type C = { menu_item_id: string; portion_cost: number; missing_prices: number; ingredient_count: number };

export default async function MenuPage() {
  const { supabase, t, locale } = await requireManager();
  const [{ data: menu }, { data: costs }] = await Promise.all([
    supabase.from("menu_items").select("id, name, name_ar, category, selling_price").order("category").order("name"),
    supabase.from("menu_item_costs").select("*"),
  ]);
  const costOf = new Map(((costs ?? []) as C[]).map((c) => [c.menu_item_id, c]));
  const groups = new Map<string, Row[]>();
  for (const m of (menu ?? []) as Row[]) {
    const k = m.category ?? "";
    groups.set(k, [...(groups.get(k) ?? []), m]);
  }

  return (
    <>
      <PageHeader title={t.menu} />
      <details className="card mb-4">
        <summary className="cursor-pointer font-medium">+ {t.newMenuItem}</summary>
        <form action={createMenuItem} className="mt-3 space-y-2">
          <input name="name" required placeholder={t.name} className="input" />
          <input name="name_ar" placeholder={t.nameAr} className="input" dir="rtl" />
          <div className="grid grid-cols-2 gap-2">
            <input name="category" placeholder={t.category} className="input" />
            <input name="selling_price" inputMode="decimal" placeholder={t.sellingPrice} className="input num" />
          </div>
          <button className="btn-primary w-full">{t.add}</button>
        </form>
      </details>

      {groups.size === 0 && <Empty>{t.none}</Empty>}
      {[...groups.entries()].map(([cat, rows]) => (
        <section key={cat} className="mb-5">
          {cat && <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-bean-600">{cat}</h2>}
          <ul className="space-y-2">
            {rows.map((m) => {
              const c = costOf.get(m.id);
              const cost = Number(c?.portion_cost ?? 0);
              const p = c?.ingredient_count ? costPct(cost, m.selling_price) : null;
              return (
                <li key={m.id}>
                  <RowLink href={`/menu/${m.id}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{localName(m, locale)}</span>
                      <span className={`num text-lg font-bold ${pctColor(p)}`}>{p != null ? `${p.toFixed(0)}%` : "–"}</span>
                    </div>
                    <div className="muted num flex justify-between">
                      <span>
                        {t.cost} {c?.ingredient_count ? fmtAED(cost, locale) : "–"}
                        {!!c?.missing_prices && " ⚠️"}
                      </span>
                      <span>{fmtAED(m.selling_price, locale)}</span>
                    </div>
                  </RowLink>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}
