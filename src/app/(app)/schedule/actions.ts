"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/session";
import { addDays, dubaiInstant } from "@/lib/format";

export async function addShift(_: unknown, form: FormData) {
  const { supabase, profile } = await requireManager();
  const date = String(form.get("date"));
  const start = String(form.get("start"));
  const end = String(form.get("end"));
  const staffIds = form.getAll("staff_id").map(String).filter(Boolean);
  if (!staffIds.length) return { ok: false, error: "staff" };
  const starts_at = dubaiInstant(date, start);
  // An end time earlier than the start means the shift runs past midnight.
  const ends_at = dubaiInstant(end <= start ? addDays(date, 1) : date, end);
  const station = String(form.get("station") ?? "").trim() || null;
  const notes = String(form.get("notes") ?? "").trim() || null;
  const { error } = await supabase
    .from("shifts")
    .insert(staffIds.map((staff_id) => ({ staff_id, starts_at, ends_at, station, notes, created_by: profile.id })));
  revalidatePath("/schedule");
  return { ok: !error, error: error?.message };
}

export async function deleteShift(form: FormData) {
  const { supabase } = await requireManager();
  await supabase.from("shifts").delete().eq("id", String(form.get("id")));
  revalidatePath("/schedule");
}

export async function copyWeek(form: FormData) {
  const { supabase } = await requireManager();
  const to = String(form.get("week"));
  await supabase.rpc("copy_week", { p_from: addDays(to, -7), p_to: to });
  revalidatePath("/schedule");
}
