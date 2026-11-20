import { notFound } from "next/navigation";
import { requireManager } from "@/lib/session";
import { dubaiDate, fmtTime } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import EventForm from "../../event-form";

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, t } = await requireManager();
  const [{ data: ev }, { data: people }, { data: assigned }] = await Promise.all([
    supabase.from("events").select("*").eq("id", id).single(),
    supabase.from("profiles").select("id, full_name, position").eq("active", true).order("full_name"),
    supabase.from("event_staff").select("staff_id, duty").eq("event_id", id),
  ]);
  if (!ev) notFound();
  return (
    <>
      <PageHeader title={t.edit} back={`/events/${id}`} />
      <EventForm
        t={t}
        people={people ?? []}
        values={{
          id,
          title: ev.title,
          description: ev.description,
          location: ev.location,
          guests: ev.guests,
          date: dubaiDate(new Date(ev.starts_at)),
          start: fmtTime(ev.starts_at, "en"),
          end: ev.ends_at ? fmtTime(ev.ends_at, "en") : "",
          staff: Object.fromEntries((assigned ?? []).map((a) => [a.staff_id, a.duty])),
        }}
      />
    </>
  );
}
