"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/session";

const s = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;
const num = (v: FormDataEntryValue | null) => {
  const x = String(v ?? "").trim().replace(",", ".");
  return x === "" ? null : Number(x);
};
const done = () => {
  revalidatePath("/addons");
  revalidatePath("/pos");
};

export async function saveGroup(form: FormData) {
  const { supabase } = await requireManager();
  const row = {
    name: s(form.get("name")) ?? "?",
    name_ar: s(form.get("name_ar")),
    min_select: num(form.get("min_select")) ?? 0,
    max_select: Math.max(1, num(form.get("max_select")) ?? 1),
  };
  const id = s(form.get("id"));
  if (id) await supabase.from("modifier_groups").update(row).eq("id", id);
  else await supabase.from("modifier_groups").insert(row);
  done();
}

export async function deleteGroup(form: FormData) {
  const { supabase } = await requireManager();
  await supabase.from("modifier_groups").delete().eq("id", String(form.get("id")));
  done();
}

export async function saveOption(form: FormData) {
  const { supabase } = await requireManager();
  const item_id = s(form.get("item_id"));
  const row = {
    group_id: String(form.get("group_id")),
    name: s(form.get("name")) ?? "?",
    name_ar: s(form.get("name_ar")),
    price_delta: num(form.get("price_delta")) ?? 0,
    item_id,
    quantity: item_id ? num(form.get("quantity")) : null,
    no_stock: form.get("no_stock") === "on",
  };
  const id = s(form.get("id"));
  if (id) await supabase.from("modifier_options").update(row).eq("id", id);
  else await supabase.from("modifier_options").insert(row);
  done();
}

export async function deleteOption(form: FormData) {
  const { supabase } = await requireManager();
  await supabase.from("modifier_options").delete().eq("id", String(form.get("id")));
  done();
}

/** Attach a group to every item in a menu category (e.g. "Milk choice" on all White coffees). */
export async function attachToCategory(form: FormData) {
  const { supabase } = await requireManager();
  const group_id = String(form.get("group_id"));
  const category = String(form.get("category") ?? "");
  const { data } = await supabase.from("menu_items").select("id").eq("category", category);
  if (data?.length) {
    await supabase
      .from("menu_item_modifier_groups")
      .upsert(data.map((m) => ({ menu_item_id: m.id, group_id })), { ignoreDuplicates: true });
  }
  done();
}
