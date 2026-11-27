"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/session";

const ok = (s: string) => s === "bar" || s === "kitchen";

/** Send a whole category (or the items with no category) to one station. */
export async function setCategoryStation(form: FormData) {
  const { supabase } = await requireManager();
  const station = String(form.get("station"));
  if (!ok(station)) return;
  const category = String(form.get("category") ?? "");
  const q = supabase.from("menu_items").update({ station });
  const { error } = category ? await q.eq("category", category) : await q.is("category", null);
  if (error) throw new Error(error.message);
  revalidatePath("/stations");
}

export async function setItemStation(form: FormData) {
  const { supabase } = await requireManager();
  const station = String(form.get("station"));
  if (!ok(station)) return;
  const id = String(form.get("id"));
  const { error } = await supabase.from("menu_items").update({ station }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/stations");
  revalidatePath(`/menu/${id}`);
}
