import Link from "next/link";
import { getSession } from "@/lib/session";
import { fmtDate, fmtTime } from "@/lib/format";
import { Empty, PageHeader, RowLink } from "@/components/ui";

type Ev = { id: string; title: string; starts_at: string; location: string | null; guests: number | null; event_staff: { staff_id: string }[] };

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ past?: string }> }) {
  const { supabase, profile, t, locale, isManager } = await getSession();
  const past = (await searchParams).past === "1";
  const now = new Date(Date.now() - 6 * 3600_000).toISOString();
  let q = supabase.from("events").select("id, title, starts_at, location, guests, event_staff(staff_id)");
  q = past ? q.lt("starts_at", now).order("starts_at", { ascending: false }).limit(30) : q.gte("starts_at", now).order("starts_at");
  const { data } = await q;
  const events = (data ?? []) as Ev[];

  return (
    <>
      <PageHeader
        title={t.events}
        action={isManager && <Link href="/events/new" className="btn-primary btn-sm">+ {t.newEvent}</Link>}
      />
      <div className="seg mb-4">
        <Link href="/events" className={`seg-item flex-1 ${!past ? "seg-on" : ""}`}>{t.upcoming}</Link>
        <Link href="/events?past=1" className={`seg-item flex-1 ${past ? "seg-on" : ""}`}>{t.past}</Link>
      </div>
      <div>
        {events.length ? (
          <ul className="space-y-2">
            {events.map((e) => {
              const mine = e.event_staff.some((s) => s.staff_id === profile.id);
              return (
                <li key={e.id}>
                  <RowLink href={`/events/${e.id}`}>
                    <div className="flex items-center gap-2 font-semibold">
                      {e.title}
                      {mine && <span className="badge bg-accent text-white">★</span>}
                    </div>
                    <div className="muted">
                      {fmtDate(e.starts_at, locale, { weekday: "short" })} · <span className="num">{fmtTime(e.starts_at, locale)}</span>
                      {e.location && ` · ${e.location}`} · 👥 {e.event_staff.length}
                    </div>
                  </RowLink>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty>{t.noEvents}</Empty>
        )}
      </div>
    </>
  );
}
