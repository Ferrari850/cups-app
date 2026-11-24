import Link from "next/link";
import { requireManager } from "@/lib/session";
import { fmtNum } from "@/lib/format";
import { localName } from "@/lib/i18n";
import { channelPrice, missingTable, suggestedPrice, type Channel } from "@/lib/pos";
import { DbUpdateNeeded } from "@/components/db-update";
import { PageHeader } from "@/components/ui";
import SubmitButton from "@/components/submit-button";
import { fillEmptyPrices } from "./actions";

/**
 * One price change, all platforms: the menu price drives every channel.
 * This list is the checklist of what each delivery app should show.
 */
export default async function PricesPage({ searchParams }: { searchParams: Promise<{ only?: string }> }) {
  const { supabase, t, locale } = await requireManager();
  const sp = await searchParams;
  const [ch, menu, costs, fixed, settings] = await Promise.all([
    supabase.from("channels").select("*").eq("active", true).order("sort"),
    supabase.from("menu_items").select("id, name, name_ar, category, selling_price, active, sold_out").order("category").order("name"),
    supabase.from("menu_item_costs").select("menu_item_id, portion_cost, missing_prices, ingredient_count"),
    supabase.from("channel_prices").select("menu_item_id, channel_id, price"),
    supabase.from("cafe_settings").select("target_cost_pct, margin_alert_pct").maybeSingle(),
  ]);
  if (missingTable(ch.error)) return <DbUpdateNeeded text={t.dbUpdateNeeded} />;
  const channels = ((ch.data ?? []) as Channel[]).filter((c) => !sp.only || c.code === sp.only);
  const allChannels = (ch.data ?? []) as Channel[];
  const costBy = new Map((costs.data ?? []).map((c) => [c.menu_item_id, c]));
  const fixedBy = new Map((fixed.data ?? []).map((f) => [`${f.menu_item_id}:${f.channel_id}`, Number(f.price)]));
  const target = Number(settings.data?.target_cost_pct ?? 30);
  const alert = Number(settings.data?.margin_alert_pct ?? 35);
  const rows = (menu.data ?? []).filter((m) => m.active);
  const empty = rows.filter((m) => m.selling_price == null).length;

  return (
    <>
      <PageHeader title={t.priceList} back="/channels" />
      <p className="muted mb-3">{t.priceListHint}</p>
      <div className="seg mb-3 overflow-x-auto">
        <Link href="/prices" className={`seg-item shrink-0 ${!sp.only ? "seg-on" : ""}`}>{t.all}</Link>
        {allChannels.map((c) => (
          <Link key={c.id} href={`/prices?only=${c.code}`} className={`seg-item shrink-0 ${sp.only === c.code ? "seg-on" : ""}`}>{localName(c, locale)}</Link>
        ))}
      </div>
      {empty > 0 && (
        <form action={fillEmptyPrices} className="card mb-3 flex flex-wrap items-center justify-between gap-2 ring-1 ring-amber-300">
          <span className="text-sm">{t.emptyPrices.replace("{n}", String(empty)).replace("{pct}", String(target))}</span>
          <SubmitButton className="btn-primary btn-sm" confirmText={t.areYouSure}>{t.fillPrices}</SubmitButton>
        </form>
      )}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="text-xs text-bean-600">
            <tr className="border-b border-bean-100">
              <th className="p-2 text-start">{t.item}</th>
              <th className="p-2 text-end">{t.cost}</th>
              <th className="p-2 text-end">{t.suggested}</th>
              {channels.map((c) => <th key={c.id} className="p-2 text-end">{localName(c, locale)}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const c = costBy.get(m.id);
              const cost = c?.ingredient_count ? Number(c.portion_cost) : null;
              return (
                <tr key={m.id} className="border-b border-bean-100 last:border-0">
                  <td className="p-2">
                    <Link href={`/menu/${m.id}`} className="font-medium hover:text-accent-ink">{localName(m, locale)}</Link>
                    {m.sold_out && <span className="badge ms-1 bg-red-100 text-red-800">{t.soldOut}</span>}
                  </td>
                  <td className="num p-2 text-end text-bean-600">{cost != null ? fmtNum(cost, locale) : "–"}{c?.missing_prices ? " ⚠️" : ""}</td>
                  <td className="num p-2 text-end text-bean-600">{cost ? fmtNum(suggestedPrice(cost, target), locale) : "–"}</td>
                  {channels.map((ch) => {
                    const f = fixedBy.get(`${m.id}:${ch.id}`);
                    const price = f ?? channelPrice(m.selling_price == null ? null : Number(m.selling_price), ch);
                    const net = price ? (price / 1.05) * (1 - Number(ch.commission_pct) / 100) : null;
                    const pct = cost != null && net ? (cost / net) * 100 : null;
                    return (
                      <td key={ch.id} className="num p-2 text-end">
                        <span className={`font-semibold ${f != null ? "text-accent-ink" : ""}`}>{price != null ? fmtNum(price, locale) : "–"}</span>
                        {pct != null && <div className={`text-[11px] ${pct > alert ? "font-bold text-red-700" : "text-bean-500"}`}>{pct.toFixed(0)}%</div>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted mt-2 text-xs">{t.priceLegend.replace("{pct}", String(alert))}</p>
    </>
  );
}
