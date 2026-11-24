import { requireManager } from "@/lib/session";
import { fmtNum } from "@/lib/format";
import { localName } from "@/lib/i18n";
import { PageHeader } from "@/components/ui";
import SubmitButton from "@/components/submit-button";
import { submitCount } from "../actions";

/** Weekly count: type what is on the shelf; the app books the difference. Leave blank to skip an item. */
export default async function CountPage() {
  const { supabase, t, locale } = await requireManager();
  const [{ data: items }, { data: stock }] = await Promise.all([
    supabase.from("items").select("id, name, name_ar, base_unit, category").eq("track_stock", true).order("category").order("name"),
    supabase.from("item_stock").select("item_id, on_hand"),
  ]);
  const onHand = new Map((stock ?? []).map((s) => [s.item_id, Number(s.on_hand)]));
  const unit = (u: string) => (u === "g" ? t.unit_g : u === "ml" ? t.unit_ml : t.unit_pcs);
  return (
    <>
      <PageHeader title={t.stockCount} back="/stock" />
      <p className="muted mb-3">{t.countHint}</p>
      <form action={submitCount} className="space-y-1.5">
        {(items ?? []).map((i) => (
          <label key={i.id} className="card flex items-center gap-2 p-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{localName(i, locale)}</span>
              <span className="muted num text-xs">{t.system}: {fmtNum(onHand.get(i.id) ?? 0, locale, 1)} {unit(i.base_unit)}</span>
            </span>
            <input name={`c_${i.id}`} inputMode="decimal" className="input num w-28" />
            <span className="w-8 text-xs">{unit(i.base_unit)}</span>
          </label>
        ))}
        <div className="sticky bottom-24 space-y-2 pt-2">
          <input name="note" placeholder={t.notes} className="input" />
          <SubmitButton className="btn-primary w-full">{t.saveCount}</SubmitButton>
        </div>
      </form>
    </>
  );
}
