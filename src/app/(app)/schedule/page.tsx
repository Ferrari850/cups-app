import Link from "next/link";
import { getSession } from "@/lib/session";
import { addDays, dubaiDate, dubaiInstant, fmtDate, fmtDay, fmtTime, hoursBetween, weekStart } from "@/lib/format";
import { Empty } from "@/components/ui";
import SubmitButton from "@/components/submit-button";
import { Icon } from "@/components/icons";
import AddShift from "./add-shift";
import { copyWeek, deleteShift } from "./actions";

type Shift = {
  id: string;
  staff_id: string;
  starts_at: string;
  ends_at: string;
  station: string | null;
  notes: string | null;
  profiles: { full_name: string } | null;
};

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ week?: string; view?: string }> }) {
  const { supabase, profile, t, locale, isManager } = await getSession();
  const sp = await searchParams;
  const week = weekStart(sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? sp.week : dubaiDate());
  const mine = sp.view === "mine";
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));

  let q = supabase
    .from("shifts")
    .select("id, staff_id, starts_at, ends_at, station, notes, profiles!shifts_staff_id_fkey(full_name)")
    .gte("starts_at", dubaiInstant(week, "00:00"))
    .lt("starts_at", dubaiInstant(addDays(week, 7), "00:00"))
    .order("starts_at");
  if (mine) q = q.eq("staff_id", profile.id);
  const [{ data }, { data: staff }] = await Promise.all([
    q,
    isManager
      ? supabase.from("profiles").select("id, full_name").eq("active", true).order("full_name")
      : Promise.resolve({ data: null }),
  ]);
  const shifts = (data ?? []) as unknown as Shift[];

  const byDay = new Map<string, Shift[]>(days.map((d) => [d, []]));
  for (const s of shifts) byDay.get(dubaiDate(new Date(s.starts_at)))?.push(s);

  const hours = new Map<string, { name: string; h: number }>();
  for (const s of shifts) {
    const cur = hours.get(s.staff_id) ?? { name: s.profiles?.full_name ?? "", h: 0 };
    cur.h += hoursBetween(s.starts_at, s.ends_at);
    hours.set(s.staff_id, cur);
  }

  const today = dubaiDate();
  const link = (w: string, v = sp.view) => `/schedule?week=${w}${v ? `&view=${v}` : ""}`;

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="h1">{t.schedule}</h1>
        <div className="seg">
          <Link href={link(week, "")} className={`seg-item ${!mine ? "seg-on" : ""}`}>{t.everyone}</Link>
          <Link href={link(week, "mine")} className={`seg-item ${mine ? "seg-on" : ""}`}>{t.myShifts}</Link>
        </div>
      </div>

      <div className="card mb-4 flex items-center justify-between p-2">
        <Link href={link(addDays(week, -7))} className="p-2" aria-label={t.prevWeek}>
          <Icon name="chevron" className="h-5 w-5 rotate-180 rtl:rotate-0" />
        </Link>
        <Link href={link(weekStart(today))} className="text-center">
          <div className="font-semibold">
            {fmtDate(days[0] + "T12:00:00Z", locale)} – {fmtDate(days[6] + "T12:00:00Z", locale)}
          </div>
          {week !== weekStart(today) && <div className="text-xs text-bean-600 underline">{t.thisWeek}</div>}
        </Link>
        <Link href={link(addDays(week, 7))} className="p-2" aria-label={t.nextWeek}>
          <Icon name="chevron" className="h-5 w-5 rtl:rotate-180" />
        </Link>
      </div>

      {isManager && (
        <div className="mb-4 flex gap-2">
          <AddShift t={t} staff={staff ?? []} days={days} locale={locale} />
          {shifts.length === 0 && (
            <form action={copyWeek}>
              <input type="hidden" name="week" value={week} />
              <SubmitButton className="btn-secondary">{t.copyLastWeek}</SubmitButton>
            </form>
          )}
        </div>
      )}

      <div className="space-y-3">
        {days.map((d) => {
          const list = byDay.get(d)!;
          return (
            <section key={d} className={`card ${d === today ? "ring-2 ring-accent" : ""}`}>
              <h2 className="mb-2 flex items-center gap-2 font-bold">{fmtDay(d + "T12:00:00Z", locale)}{d === today && <span className="badge bg-accent-soft text-accent-ink">{t.today}</span>}</h2>
              {list.length === 0 ? (
                <p className="muted">{mine ? t.off : "—"}</p>
              ) : (
                <ul className="divide-y divide-bean-100">
                  {list.map((s) => {
                    const isMine = s.staff_id === profile.id;
                    const future = new Date(s.starts_at) > new Date();
                    return (
                      <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                        <div className="min-w-0">
                          <div className={`truncate ${isMine ? "font-bold text-bean-800" : ""}`}>
                            {isMine && "● "}
                            {s.profiles?.full_name}
                          </div>
                          {(s.station || s.notes) && (
                            <div className="muted truncate">{[s.station, s.notes].filter(Boolean).join(" · ")}</div>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="num font-medium">
                            {fmtTime(s.starts_at, locale)}–{fmtTime(s.ends_at, locale)}
                          </span>
                          {isMine && future && (
                            <Link href={`/swaps/new?shift=${s.id}`} className="btn-secondary btn-sm">
                              <Icon name="swap" className="h-4 w-4" />
                              {t.requestSwap}
                            </Link>
                          )}
                          {isManager && (
                            <form action={deleteShift}>
                              <input type="hidden" name="id" value={s.id} />
                              <SubmitButton className="p-1 text-bean-300 hover:text-red-600" confirmText={t.areYouSure}>
                                <Icon name="trash" className="h-4 w-4" />
                              </SubmitButton>
                            </form>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {isManager && hours.size > 0 && !mine && (
        <section className="card mt-4">
          <h2 className="eyebrow mb-3">{t.hours}</h2>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {[...hours.values()]
              .sort((a, b) => b.h - a.h)
              .map((x) => (
                <li key={x.name} className="flex justify-between">
                  <span className="truncate">{x.name}</span>
                  <span className="num font-medium">{Math.round(x.h * 10) / 10}</span>
                </li>
              ))}
          </ul>
        </section>
      )}
      {shifts.length === 0 && !isManager && <Empty>{t.noShifts}</Empty>}
    </>
  );
}
