"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManager } from "@/lib/session";

function read(form: FormData) {
  const bu = String(form.get("base_unit"));
  return {
    name: String(form.get("name") ?? "").trim(),
    name_ar: String(form.get("name_ar") ?? "").trim() || null,
    category: String(form.get("category") ?? "").trim() || null,
    base_unit: bu === "g" || bu === "ml" ? bu : "pcs",
  };
}

export async function createItem(form: FormData) {
  const { supabase } = await requireManager();
  const { data, error } = await supabase.from("items").insert(read(form)).select("id").single();
  if (error) throw new Error(error.message);
  revalidatePath("/items");
  redirect(`/items/${data.id}`);
}

export async function updateItem(form: FormData) {
  const { supabase } = await requireManager();
  const id = String(form.get("id"));
  const patch: Record<string, unknown> = read(form);
  // Optional manual price, entered per kg / L / piece for convenience.
  const manual = String(form.get("manual_price") ?? "").trim();
  if (manual) {
    const v = Number(manual.replace(",", "."));
    if (Number.isFinite(v) && v >= 0) {
      patch.unit_cost = patch.base_unit === "pcs" ? v : v / 1000;
      patch.unit_cost_at = new Date().toISOString().slice(0, 10);
    }
  }
  await supabase.from("items").update(patch).eq("id", id);
  revalidatePath("/items");
  revalidatePath(`/items/${id}`);
  revalidatePath("/menu");
}

export async function deleteItem(form: FormData) {
  const { supabase } = await requireManager();
  const { error } = await supabase.from("items").delete().eq("id", String(form.get("id")));
  if (error) throw new Error("This ingredient is used in a recipe.");
  revalidatePath("/items");
  redirect("/items");
}
