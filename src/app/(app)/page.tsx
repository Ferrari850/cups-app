import Link from "next/link";
import { getSession } from "@/lib/session";
import { fmtDay, fmtTime, fmtDate } from "@/lib/format";
import { Empty, Section } from "@/components/ui";

export default async function HomePage() {
  const { supabase, profile, t, locale, isManager } = await getSession();
  const now = new Date().toISOString();

  const [{ data: shifts }, { data: myEvents }] = await Promise.all([
    supabase
      .from("shifts")
      .select("id, starts_at, ends_at, station")
      .eq("staff_id", profile.id)
      .gte("ends_at", now)
      .order("starts_at")
      .limit(5),
    supabase
      .from("event_staff")
      .select("duty, events!inner(id, title, starts_at, location)")
      .eq("staff_id", profile.id)
      .gte("events.starts_at", now)
      .limit(5),
  ]);

  let counts = { swaps: 0, invoices: 0, alerts: 0 };
  if (isManager) {
    const [a, b, c] = await Promise.all([
      supabase.from("swap_requests").select("id", { count: "exact", head: true }).eq("status", "pending_manager"),
      supabase.from("invoices").select("id", { count: "exact", head: true }).eq("status", "review"),
      supabase.from("price_alerts").select("id", { count: "exact", head: true }).is("dismissed_at", null),
    ]);
    counts = { swaps: a.count ?? 0, invoices: b.count ?? 0, alerts: c.count ?? 0 };
  }

  type EventRow = { duty: string | null; events: { id: string; title: string; starts_at: string; location: string | null } };
  const events = ((myEvents ?? []) as unknown as EventRow[]).sort((x, y) => x.events.starts_at.localeCompare(y.events.starts_at));

  return (
    <>
      <h1 className="h1 mb-4">
        {t.hello}, {profile.full_name.split(" ")[0]} 👋
      </h1>

      {isManager && (counts.swaps > 0 || counts.invoices > 0 || counts.alerts > 0) && (
        <Section title={t.needsAttention}>
          <div className="grid grid-cols-3 gap-2">
            <Tile href="/swaps" n={counts.swaps} label={t.pendingSwaps} />
            <Tile href="/invoices" n={counts.invoices} label={t.invoicesToReview} />
            <Tile href="/alerts" n={counts.alerts} label={t.newPriceAlerts} />
          </div>
        </Section>
      )}

      <Section title={t.myNextShifts} action={<Link href="/schedule" className="text-sm text-bean-600 underline">{t.schedule}</Link>}>
        {shifts?.length ? (
          <ul className="space-y-2">
            {shifts.map((s) => (
              <li key={s.id} className="card flex items-center justify-between">
                <div>
                  <div className="font-semibold">{fmtDay(s.starts_at, locale)}</div>
                  {s.station && <div className="muted">{s.station}</div>}
                </div>
                <div className="num text-lg font-semibold text-bean-700">
                  {fmtTime(s.starts_at, locale)}–{fmtTime(s.ends_at, locale)}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>{t.noShifts}</Empty>
        )}
      </Section>

      <Section title={t.myEvents}>
        {events.length ? (
          <ul className="space-y-2">
            {events.map((e) => (
              <li key={e.events.id}>
                <Link href={`/events/${e.events.id}`} className="card block">
                  <div className="font-semibold">{e.events.title}</div>
                  <div className="muted">
                    {fmtDate(e.events.starts_at, locale, { weekday: "short" })} · <span className="num">{fmtTime(e.events.starts_at, locale)}</span>
                    {e.duty && <> · {e.duty}</>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>{t.noEvents}</Empty>
        )}
      </Section>
    </>
  );
}

function Tile({ href, n, label }: { href: string; n: number; label: string }) {
  return (
    <Link href={href} className={`card text-center ${n ? "ring-amber-300" : ""}`}>
      <div className={`text-2xl font-bold ${n ? "text-amber-700" : "text-bean-300"}`}>{n}</div>
      <div className="text-xs text-bean-700">{label}</div>
    </Link>
  );
}
