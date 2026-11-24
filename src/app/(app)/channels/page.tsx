import Link from "next/link";
import { requireManager } from "@/lib/session";
import { missingTable, type Channel } from "@/lib/pos";
import { DbUpdateNeeded } from "@/components/db-update";
import { PageHeader } from "@/components/ui";
import SubmitButton from "@/components/submit-button";
import { saveChannel } from "./actions";

/** Order types and delivery apps: price rule (e.g. Talabat = POS x 1.37, rounded up) and commission. */
export default async function ChannelsPage() {
  const { supabase, t } = await requireManager();
  const { data, error } = await supabase.from("channels").select("*").order("sort");
  if (missingTable(error)) return <DbUpdateNeeded text={t.dbUpdateNeeded} />;

  const Fields = ({ c }: { c?: Channel }) => (
    <>
      {c && <input type="hidden" name="id" value={c.id} />}
      <div className="grid grid-cols-2 gap-2">
        <input name="name" required defaultValue={c?.name} placeholder={t.name} className="input" />
        <input name="name_ar" defaultValue={c?.name_ar ?? ""} placeholder={t.nameAr} dir="rtl" className="input" />
        <label className="text-xs text-bean-600">{t.priceMultiplier}<input name="price_multiplier" defaultValue={c?.price_multiplier ?? 1} inputMode="decimal" className="input num" /></label>
        <label className="text-xs text-bean-600">{t.roundUpTo}<input name="round_to" defaultValue={c?.round_to ?? 0} inputMode="decimal" className="input num" /></label>
        <label className="text-xs text-bean-600">{t.commissionPct}<input name="commission_pct" defaultValue={c?.commission_pct ?? 0} inputMode="decimal" className="input num" /></label>
        <label className="text-xs text-bean-600">{t.sortOrder}<input name="sort" defaultValue={c?.sort ?? 0} inputMode="numeric" className="input num" /></label>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-1.5"><input type="checkbox" name="needs_car" defaultChecked={c?.needs_car} /> {t.needsCar}</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" name="is_app" defaultChecked={c?.is_app} /> {t.isApp}</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" name="active" defaultChecked={c?.active ?? true} /> {t.active}</label>
      </div>
    </>
  );

  return (
    <>
      <PageHeader title={t.channels} back="/more" action={<Link href="/prices" className="btn-secondary btn-sm">{t.priceList}</Link>} />
      <p className="muted mb-3">{t.channelsHint}</p>
      <div className="space-y-3">
        {((data ?? []) as Channel[]).map((c) => (
          <form key={c.id} action={saveChannel} className={`card space-y-2 ${c.active ? "" : "opacity-60"}`}>
            <Fields c={c} />
            <SubmitButton className="btn-primary btn-sm">{t.save}</SubmitButton>
          </form>
        ))}
        <details className="card">
          <summary className="cursor-pointer font-semibold">+ {t.newChannel}</summary>
          <form action={saveChannel} className="mt-3 space-y-2">
            <Fields />
            <SubmitButton className="btn-primary btn-sm">{t.add}</SubmitButton>
          </form>
        </details>
      </div>
    </>
  );
}
