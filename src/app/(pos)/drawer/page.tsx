import { getSession } from "@/lib/session";
import { fmtAED, fmtDate, fmtTime } from "@/lib/format";
import { missingTable } from "@/lib/pos";
import { DbUpdateNeeded } from "@/components/db-update";
import SubmitButton from "@/components/submit-button";
import { closeDrawer, openDrawer } from "./actions";

/** Cash drawer: open with a float, close with a count; the difference shows straight away. */
export default async function DrawerPage({ searchParams }: { searchParams: Promise<{ diff?: string; err?: string }> }) {
  const { supabase, t, locale, isManager } = await getSession();
  const sp = await searchParams;
  const [{ data: open, error }, { data: recent }] = await Promise.all([
    supabase.from("registers").select("*").is("closed_at", null).maybeSingle(),
    supabase.from("registers").select("*").not("closed_at", "is", null).order("closed_at", { ascending: false }).limit(isManager ? 14 : 3),
  ]);
  if (missingTable(error)) return <DbUpdateNeeded text={t.dbUpdateNeeded} />;

  let cash = 0;
  let card = 0;
  let app = 0;
  if (open) {
    const { data: pays } = await supabase.from("payments").select("method, amount").eq("register_id", open.id);
    for (const p of pays ?? []) {
      if (p.method === "cash") cash += Number(p.amount);
      else if (p.method === "card") card += Number(p.amount);
      else app += Number(p.amount);
    }
  }
  const names = new Map<string, string>();
  const ids = [...new Set([open?.opened_by, ...(recent ?? []).flatMap((r) => [r.opened_by, r.closed_by])].filter(Boolean))] as string[];
  if (ids.length) {
    const { data: people } = await supabase.from("profiles").select("id, full_name").in("id", ids);
    for (const p of people ?? []) names.set(p.id, p.full_name);
  }

  return (
    <div className="mx-auto max-w-xl space-y-3">
      {sp.diff != null && (
        <p className={`card text-lg font-bold ${Number(sp.diff) === 0 ? "text-green-700" : "text-amber-800"}`}>
          {t.drawerClosed}: {Number(sp.diff) === 0 ? t.drawerExact : `${Number(sp.diff) > 0 ? t.drawerOver : t.drawerShort} ${fmtAED(Math.abs(Number(sp.diff)), locale)}`}
        </p>
      )}
      {sp.err && <p className="card text-red-700">{sp.err}</p>}
      {open ? (
        <div className="card space-y-3">
          <h1 className="h2">{t.drawerOpen}</h1>
          <p className="muted">
            {names.get(open.opened_by)} · {fmtDate(open.opened_at, locale)} <span className="num">{fmtTime(open.opened_at, locale)}</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Stat label={t.openingCash} value={fmtAED(open.opening_cash, locale)} />
            <Stat label={t.cashSales} value={fmtAED(cash, locale)} />
            <Stat label={t.pay_card} value={fmtAED(card, locale)} />
            <Stat label={t.pay_app} value={fmtAED(app, locale)} />
          </div>
          <p className="font-bold">
            {t.expectedCash}: <span className="num">{fmtAED(Number(open.opening_cash) + cash, locale)}</span>
          </p>
          <form action={closeDrawer} className="space-y-2">
            <label className="label">{t.countedCash}</label>
            <input name="counted" required inputMode="decimal" className="input num text-xl" />
            <input name="notes" placeholder={t.notes} className="input" />
            <SubmitButton className="btn-primary w-full">{t.closeDrawer}</SubmitButton>
          </form>
        </div>
      ) : (
        <form action={openDrawer} className="card space-y-2">
          <h1 className="h2">{t.openDrawer}</h1>
          <label className="label">{t.openingCash}</label>
          <input name="cash" required inputMode="decimal" defaultValue="0" className="input num text-xl" />
          <SubmitButton className="btn-primary w-full">{t.openDrawer}</SubmitButton>
        </form>
      )}
      {(recent ?? []).length > 0 && (
        <section className="card">
          <h2 className="eyebrow mb-2">{t.pastDrawers}</h2>
          <ul className="divide-y divide-bean-100 text-sm">
            {(recent ?? []).map((r) => {
              const diff = Number(r.counted_cash) - Number(r.expected_cash);
              return (
                <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                  <div>
                    <div className="font-semibold">{fmtDate(r.closed_at, locale, { weekday: "short" })} <span className="num">{fmtTime(r.opened_at, locale)}–{fmtTime(r.closed_at, locale)}</span></div>
                    <div className="muted text-xs">{names.get(r.closed_by)}{r.notes && ` · ${r.notes}`}</div>
                  </div>
                  <div className="text-end">
                    <div className="num">{fmtAED(r.counted_cash, locale)}</div>
                    <div className={`num text-xs font-bold ${diff === 0 ? "text-green-700" : "text-amber-800"}`}>{diff > 0 ? "+" : ""}{diff.toFixed(2)}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="tile">
      <div className="eyebrow">{label}</div>
      <div className="num mt-1 text-lg font-extrabold">{value}</div>
    </div>
  );
}
