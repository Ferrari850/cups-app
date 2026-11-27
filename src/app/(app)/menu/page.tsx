import Link from "next/link";
import { requireManager } from "@/lib/session";
import { fmtAED } from "@/lib/format";
import { localName } from "@/lib/i18n";
import { Empty, PageHeader, RowLink } from "@/components/ui";
import { createMenuItem } from "./actions";
import { costPct, pctColor } from "@/lib/costing";

type Row = { id: string; name: string; name_ar: string | null; category: string | null; selling_price: number | null; image_url?: string | null };
type C = { menu_item_id: string; portion_cost: number; missing_prices: number; ingredient_count: number };

export default async function MenuPage() {
  const { supabase, t, locale } = await requireManager();
  const [{ data: menu }, { data: costs }] = await Promise.all([
    supabase.from("menu_items").select("*").order("category").order("name"),
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
      <PageHeader
        title={t.menu}
        action={
          <div className="flex gap-2">
            <Link href="/stations" className="btn-secondary btn-sm">🍳 {t.stations}</Link>
            <Link href="/menu/photos" className="btn-secondary btn-sm">📷 {t.menuPhotos}</Link>
          </div>
        }
      />
      <details className="card mb-4">
        <summary className="cursor-pointer font-medium">+ {t.newMenuItem}</summary>
        <form action={createMenuItem} className="mt-3 space-y-2">
          <input name="name" required placeholder={t.name} className="input" />
          <input name="name_ar" placeholder={t.nameAr} className="input" dir="rtl" />
          <div className="grid grid-cols-2 gap-2">
            <input name="category" placeholder={t.category} className="input" />
            <input name="selling_price" inputMode="decimal" placeholder={t.sellingPrice} className="input num" />
          </div>
          {menu?.[0] && "station" in menu[0] && (
            <label className="flex items-center gap-2 text-sm">
              {t.madeAt}
              <select name="station" defaultValue="bar" className="input min-h-9 w-auto">
                <option value="bar">☕ {t.stationBar}</option>
                <option value="kitchen">🍳 {t.stationKitchen}</option>
              </select>
            </label>
          )}
          <button className="btn-primary w-full">{t.add}</button>
        </form>
      </details>

      {groups.size === 0 && <Empty>{t.none}</Empty>}
      {[...groups.entries()].map(([cat, rows]) => (
        <section key={cat} className="mb-5">
          {cat && <h2 className="eyebrow mb-2.5 px-1">{cat}</h2>}
          <ul className="space-y-2">
            {rows.map((m) => {
              const c = costOf.get(m.id);
              const cost = Number(c?.portion_cost ?? 0);
              const p = c?.ingredient_count ? costPct(cost, m.selling_price) : null;
              return (
                <li key={m.id}>
                  <RowLink href={`/menu/${m.id}`}>
                    <div className="flex items-center gap-3">
                    {m.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.image_url} alt="" loading="lazy" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
                    ) : (
                      <span className="h-11 w-11 shrink-0 rounded-xl bg-bean-100" />
                    )}
                    <div className="min-w-0 flex-1">
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
                    </div>
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
