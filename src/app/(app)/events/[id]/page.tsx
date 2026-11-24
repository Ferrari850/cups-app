import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { fmtDay, fmtTime } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import SubmitButton from "@/components/submit-button";
import { deleteEvent } from "../actions";

type Row = { staff_id: string; duty: string | null; seen_at: string | null; profiles: { full_name: string; phone: string | null } | null };

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, profile, t, locale, isManager } = await getSession();
  const [{ data: ev }, { data }] = await Promise.all([
    supabase.from("events").select("*").eq("id", id).single(),
    supabase.from("event_staff").select("staff_id, duty, seen_at, profiles(full_name, phone)").eq("event_id", id),
  ]);
  if (!ev) notFound();
  const staff = (data ?? []) as unknown as Row[];
  if (staff.some((s) => s.staff_id === profile.id && !s.seen_at)) {
    await supabase.rpc("mark_event_seen", { p_event: id });
  }

  return (
    <>
      <PageHeader
        title={ev.title}
        back="/events"
        action={isManager && <Link href={`/events/${id}/edit`} className="btn-secondary btn-sm">{t.edit}</Link>}
      />
      <div className="card mb-4 space-y-1">
        <div className="font-semibold">{fmtDay(ev.starts_at, locale)}</div>
        <div className="num">
          {fmtTime(ev.starts_at, locale)}
          {ev.ends_at && `–${fmtTime(ev.ends_at, locale)}`}
        </div>
        {ev.location && <div>📍 {ev.location}</div>}
        {ev.guests != null && <div>👥 {ev.guests} {t.guests}</div>}
        {ev.description && <p className="whitespace-pre-wrap pt-2 text-bean-800">{ev.description}</p>}
      </div>
      <h2 className="eyebrow mb-2.5 px-1">{t.assignedStaff}</h2>
      <ul className="card divide-y divide-bean-100 p-0">
        {staff.map((s) => (
          <li key={s.staff_id} className="flex items-center justify-between px-4 py-3">
            <div>
              <div className={s.staff_id === profile.id ? "font-bold" : ""}>{s.profiles?.full_name}</div>
              {s.duty && <div className="muted">{s.duty}</div>}
            </div>
            {isManager && (
              <span className={`badge ${s.seen_at ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
                {s.seen_at ? `✓ ${t.seen}` : t.notSeen}
              </span>
            )}
          </li>
        ))}
        {staff.length === 0 && <li className="muted px-4 py-3">—</li>}
      </ul>
      {isManager && (
        <form action={deleteEvent} className="mt-6">
          <input type="hidden" name="id" value={id} />
          <SubmitButton className="btn-danger w-full" confirmText={t.areYouSure}>{t.delete}</SubmitButton>
        </form>
      )}
    </>
  );
}
