import Link from "next/link";
import { getSession } from "@/lib/session";
import { fmtDay, fmtTime, fmtDate, TZ } from "@/lib/format";
import { Empty, Panel } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import ManagerDashboard from "./dashboard";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { supabase, profile, t, locale, isManager } = await getSession();
  const sp = await searchParams;
  const now = new Date().toISOString();

  const [{ data: shifts }, { data: myEvents }] = isManager ? [{ data: [] }, { data: [] }] : await Promise.all([
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

  type EventRow = { duty: string | null; events: { id: string; title: string; starts_at: string; location: string | null } };
  const events = ((myEvents ?? []) as unknown as EventRow[]).sort((x, y) => x.events.starts_at.localeCompare(y.events.starts_at));

  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: TZ }).format(new Date()));
  const greeting = hour < 5 ? t.goodEvening : hour < 12 ? t.goodMorning : hour < 18 ? t.goodAfternoon : t.goodEvening;

  const actions: { href: string; icon: IconName; title: string; sub?: string; n?: number }[] = [
    { href: "/pos", icon: "cart", title: t.till, sub: t.newOrder },
    { href: "/bar", icon: "cup", title: t.barDisplay, sub: t.orders },
    { href: "/schedule?view=mine", icon: "calendar", title: t.schedule, sub: t.myShifts },
    { href: "/events", icon: "star", title: t.events, sub: t.upcoming },
    { href: "/swaps", icon: "swap", title: t.swaps, sub: t.requestSwap },
    { href: "/notifications", icon: "bell", title: t.notifications, sub: t.more },
  ];

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">
            {greeting}, {profile.full_name.split(" ")[0]}
          </h1>
          <p className="mt-0.5 text-sm text-bean-600">{fmtDate(new Date(), locale, { weekday: "long", year: "numeric" })}</p>
        </div>
      </div>

      {isManager ? (
        <ManagerDashboard supabase={supabase} t={t} locale={locale} range={sp.range === "7d" || sp.range === "month" ? sp.range : "today"} />
      ) : (
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title={t.quickActions} className="md:col-span-2">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {actions.map((a) => {
              const hot = !!a.n;
              return (
                <Link
                  key={a.href + a.title}
                  href={a.href}
                  className={`rounded-2xl p-3 transition active:scale-[.98] ${
                    hot ? "bg-amber-50 ring-1 ring-amber-300" : "bg-bean-50 hover:bg-bean-100"
                  }`}
                >
                  <span
                    className={`mb-2.5 inline-flex h-9 w-9 items-center justify-center rounded-xl ${
                      hot ? "bg-amber-700 text-white" : "bg-surface text-bean-700 shadow-card"
                    }`}
                  >
                    <Icon name={a.icon} className="h-5 w-5" />
                  </span>
                  <div className="line-clamp-2 text-[15px] leading-tight font-bold">{a.title}</div>
                  <div className={`truncate text-[13px] ${hot ? "font-semibold text-amber-700" : "text-bean-600"}`}>
                    {a.n !== undefined ? <span className="num">{a.n}</span> : a.sub}
                  </div>
                </Link>
              );
            })}
          </div>
        </Panel>

        <Panel title={t.myNextShifts} aside={<Link href="/schedule" className="font-medium hover:text-accent-ink">{t.seeAll}</Link>}>
          {shifts?.length ? (
            <ul className="space-y-1.5">
              {shifts.map((s, i) => (
                <li key={s.id} className={`flex items-center justify-between gap-3 rounded-2xl px-3.5 py-2.5 ${i === 0 ? "bg-accent-soft" : "bg-bean-50"}`}>
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{fmtDay(s.starts_at, locale)}</div>
                    {s.station && <div className="truncate text-xs text-bean-600">{s.station}</div>}
                  </div>
                  <div className={`num shrink-0 text-lg font-extrabold tracking-tight ${i === 0 ? "text-accent-ink" : "text-bean-800"}`}>
                    {fmtTime(s.starts_at, locale)}–{fmtTime(s.ends_at, locale)}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>{t.noShifts}</Empty>
          )}
        </Panel>

        <Panel title={t.myEvents} aside={<Link href="/events" className="font-medium hover:text-accent-ink">{t.seeAll}</Link>}>
          {events.length ? (
            <ul className="space-y-1.5">
              {events.map((e) => (
                <li key={e.events.id}>
                  <Link href={`/events/${e.events.id}`} className="flex items-center gap-3 rounded-2xl bg-bean-50 px-3.5 py-2.5 hover:bg-bean-100">
                    <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-amber-100 leading-none text-amber-800">
                      <span className="num text-base font-extrabold">{fmtDate(e.events.starts_at, locale, { month: undefined })}</span>
                      <span className="mt-0.5 text-[10px] font-semibold uppercase">{fmtDate(e.events.starts_at, locale, { day: undefined })}</span>
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{e.events.title}</div>
                      <div className="truncate text-xs text-bean-600">
                        {fmtDate(e.events.starts_at, locale, { weekday: "short" })} · <span className="num">{fmtTime(e.events.starts_at, locale)}</span>
                        {e.duty && <> · {e.duty}</>}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>{t.noEvents}</Empty>
          )}
        </Panel>
      </div>
      )}
    </>
  );
}
