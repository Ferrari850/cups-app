import { requireManager } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import EventForm from "../event-form";

export default async function NewEventPage() {
  const { supabase, t } = await requireManager();
  const { data: people } = await supabase.from("profiles").select("id, full_name, position").eq("active", true).order("full_name");
  return (
    <>
      <PageHeader title={t.newEvent} back="/events" />
      <EventForm t={t} people={people ?? []} />
    </>
  );
}
