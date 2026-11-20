"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManager } from "@/lib/session";
import { dubaiInstant } from "@/lib/format";

function readEvent(form: FormData) {
  const date = String(form.get("date"));
  const start = String(form.get("start"));
  const end = String(form.get("end") ?? "");
  const guests = parseInt(String(form.get("guests") ?? ""), 10);
  return {
    title: String(form.get("title") ?? "").trim(),
    description: String(form.get("description") ?? "").trim() || null,
    location: String(form.get("location") ?? "").trim() || null,
    starts_at: dubaiInstant(date, start),
    ends_at: end ? dubaiInstant(date, end) : null,
    guests: Number.isFinite(guests) ? guests : null,
  };
}

async function syncStaff(eventId: string, form: FormData) {
  const { supabase } = await requireManager();
  const wanted = new Map<string, string | null>();
  for (const id of form.getAll("staff_id").map(String)) {
    wanted.set(id, String(form.get(`duty_${id}`) ?? "").trim() || null);
  }
  const { data: current } = await supabase.from("event_staff").select("staff_id, duty").eq("event_id", eventId);
  const have = new Map((current ?? []).map((r) => [r.staff_id as string, r.duty as string | null]));
  const remove = [...have.keys()].filter((id) => !wanted.has(id));
  const add = [...wanted.entries()].filter(([id]) => !have.has(id));
  const change = [...wanted.entries()].filter(([id, duty]) => have.has(id) && have.get(id) !== duty);
  if (remove.length) await supabase.from("event_staff").delete().eq("event_id", eventId).in("staff_id", remove);
  if (add.length) await supabase.from("event_staff").insert(add.map(([staff_id, duty]) => ({ event_id: eventId, staff_id, duty })));
  for (const [staff_id, duty] of change) {
    await supabase.from("event_staff").update({ duty }).eq("event_id", eventId).eq("staff_id", staff_id);
  }
}

export async function createEvent(_: unknown, form: FormData) {
  const { supabase, profile } = await requireManager();
  const { data, error } = await supabase
    .from("events")
    .insert({ ...readEvent(form), created_by: profile.id })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "error" };
  await syncStaff(data.id, form);
  revalidatePath("/events");
  redirect(`/events/${data.id}`);
}

export async function updateEvent(_: unknown, form: FormData) {
  const { supabase } = await requireManager();
  const id = String(form.get("id"));
  const { error } = await supabase.from("events").update(readEvent(form)).eq("id", id);
  if (error) return { error: error.message };
  await syncStaff(id, form);
  revalidatePath("/events");
  redirect(`/events/${id}`);
}

export async function deleteEvent(form: FormData) {
  const { supabase } = await requireManager();
  await supabase.from("events").delete().eq("id", String(form.get("id")));
  revalidatePath("/events");
  redirect("/events");
}
