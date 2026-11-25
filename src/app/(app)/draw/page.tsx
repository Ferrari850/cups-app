import Link from "next/link";
import { requireManager } from "@/lib/session";
import { missingTable } from "@/lib/pos";
import { DbUpdateNeeded } from "@/components/db-update";
import { Empty, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import SubmitButton from "@/components/submit-button";
import { dubaiDate, fmtAED, fmtDate } from "@/lib/format";
import { deleteEntries, pickWinner } from "./actions";

export const dynamic = "force-dynamic";

type Entry = {
  id: string;
  customer_name: string;
  phone: string;
  business_date: string;
  won_draw_id: string | null;
  orders: { id: string; invoice_no: number; total: number; refunded: number } | null;
};
type Draw = {
  id: string;
  from_date: string;
  to_date: string;
  entries: number;
  winner_name: string;
  winner_phone: string;
  winner_invoice_no: number | null;
  drawn_at: string;
};

const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
/** Only the last 3 digits show in the list; the full number is shown for winners. */
const mask = (p: string) => (p.length > 3 ? `${"•".repeat(Math.max(0, p.length - 3))}${p.slice(-3)}` : p);

export default async function DrawPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; won?: string; err?: string; deleted?: string }>;
}) {
  const { supabase, t, locale } = await requireManager();
  const sp = await searchParams;
  const today = dubaiDate();
  const from = isDate(sp.from) ? sp.from! : `${today.slice(0, 8)}01`;
  const to = isDate(sp.to) ? sp.to! : today;

  const [entries, draws, settings] = await Promise.all([
    supabase
      .from("draw_entries")
      .select("id, customer_name, phone, business_date, won_draw_id, orders(id, invoice_no, total, refunded)")
      .gte("business_date", from)
      .lte("business_date", to)
      .order("created_at", { ascending: false }),
    supabase.from("prize_draws").select("*").order("drawn_at", { ascending: false }).limit(20),
    supabase.from("cafe_settings").select("*").maybeSingle(),
  ]);
  if (missingTable(entries.error) || missingTable(draws.error)) return <DbUpdateNeeded text={t.dbUpdateNeeded} />;

  const list = (entries.data ?? []) as unknown as Entry[];
  const past = (draws.data ?? []) as Draw[];
  const won = sp.won ? past.find((d) => d.id === sp.won) : undefined;
  const inHat = list.filter((e) => !e.won_draw_id && e.orders && Number(e.orders.total) - Number(e.orders.refunded ?? 0) > 0);
  const people = new Set(inHat.map((e) => e.phone)).size;
  const min = Number(settings.data?.draw_min_total ?? 50);

  return (
    <>
      <PageHeader title={t.prizeDraw} back="/more" action={<Link href="/settings" className="btn-secondary btn-sm">{t.posSettings}</Link>} />
      <p className="muted mb-3">
        {settings.data?.draw_enabled === false ? t.drawIsOff : t.drawHint.replace("{min}", fmtAED(min, locale))}
      </p>

      {won && (
        <div className="card mb-4 border-2 border-accent text-center">
          <Icon name="gift" className="mx-auto h-8 w-8 text-accent-ink" />
          <div className="eyebrow mt-2">{t.drawWinner}</div>
          <div className="mt-1 text-3xl font-extrabold">{won.winner_name}</div>
          <a href={`tel:${won.winner_phone}`} dir="ltr" className="num mt-1 block text-xl font-bold text-accent-ink">
            {won.winner_phone}
          </a>
          <p className="muted mt-2 text-sm">
            {t.drawOutOf.replace("{n}", String(won.entries))}
            {won.winner_invoice_no != null && <> · #{won.winner_invoice_no}</>}
          </p>
        </div>
      )}
      {sp.err && <p className="card mb-3 text-red-700">{sp.err === "none" ? t.drawNoEntries : t.error}</p>}
      {sp.deleted && <p className="card mb-3 text-green-700">✓ {t.drawDeleted}</p>}

      <form className="card mb-3 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <label className="text-xs text-bean-600">
          {t.from}
          <input type="date" name="from" defaultValue={from} className="input" />
        </label>
        <label className="text-xs text-bean-600">
          {t.to}
          <input type="date" name="to" defaultValue={to} className="input" />
        </label>
        <button className="btn-secondary col-span-2 self-end sm:col-span-1">{t.show}</button>
      </form>

      <div className="card mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="num text-3xl font-extrabold">{inHat.length}</div>
          <div className="muted text-sm">{t.drawEntriesCount.replace("{n}", String(people))}</div>
        </div>
        <form action={pickWinner}>
          <input type="hidden" name="from" value={from} />
          <input type="hidden" name="to" value={to} />
          <SubmitButton className="btn-primary" confirmText={t.drawPickConfirm} pendingText={t.saving}>
            <Icon name="gift" className="h-5 w-5" /> {t.drawPick}
          </SubmitButton>
        </form>
      </div>

      <h2 className="eyebrow mb-2 px-1">{t.drawEntries}</h2>
      {list.length === 0 ? (
        <Empty>{t.drawNoEntries}</Empty>
      ) : (
        <ul className="card divide-y divide-bean-100 px-3 py-1">
          {list.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0">
                <div className="truncate font-semibold">
                  {e.customer_name} {e.won_draw_id && <span className="badge bg-green-100 text-green-800">{t.drawWinner}</span>}
                </div>
                <div className="num text-xs text-bean-500" dir="ltr">{mask(e.phone)}</div>
              </div>
              <div className="shrink-0 text-end text-xs text-bean-600">
                {e.orders && (
                  <Link href={`/orders/${e.orders.id}`} className="num font-semibold text-bean-800">
                    #{e.orders.invoice_no} · {fmtAED(e.orders.total, locale)}
                  </Link>
                )}
                <div>{fmtDate(e.business_date, locale)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {past.length > 0 && (
        <>
          <h2 className="eyebrow mb-2 mt-6 px-1">{t.drawPast}</h2>
          <ul className="card divide-y divide-bean-100 px-3 py-1">
            {past.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{d.winner_name}</div>
                  <a href={`tel:${d.winner_phone}`} className="num text-xs text-accent-ink" dir="ltr">{d.winner_phone}</a>
                </div>
                <div className="shrink-0 text-end text-xs text-bean-600">
                  <div>{fmtDate(d.from_date, locale)} – {fmtDate(d.to_date, locale)}</div>
                  <div>{t.drawOutOf.replace("{n}", String(d.entries))}</div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {list.length > 0 && (
        <form action={deleteEntries} className="mt-6">
          <input type="hidden" name="from" value={from} />
          <input type="hidden" name="to" value={to} />
          <p className="muted mb-2 text-xs">{t.drawDeleteHint}</p>
          <SubmitButton className="btn-danger w-full" confirmText={t.drawDeleteConfirm} pendingText={t.saving}>
            <Icon name="trash" className="h-4 w-4" /> {t.drawDelete}
          </SubmitButton>
        </form>
      )}
    </>
  );
}
