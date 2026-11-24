"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManager } from "@/lib/session";

const n = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim().replace(",", ".");
  return s === "" ? null : Number(s);
};

function read(form: FormData) {
  return {
    name: String(form.get("name") ?? "").trim(),
    name_ar: String(form.get("name_ar") ?? "").trim() || null,
    category: String(form.get("category") ?? "").trim() || null,
    selling_price: n(form.get("selling_price")),
    yield_portions: n(form.get("yield_portions")) || 1,
    notes: String(form.get("notes") ?? "").trim() || null,
  };
}

export async function createMenuItem(form: FormData) {
  const { supabase } = await requireManager();
  const { data, error } = await supabase.from("menu_items").insert(read(form)).select("id").single();
  if (error) throw new Error(error.message);
  revalidatePath("/menu");
  redirect(`/menu/${data.id}`);
}

export async function updateMenuItem(form: FormData) {
  const { supabase } = await requireManager();
  const id = String(form.get("id"));
  await supabase.from("menu_items").update(read(form)).eq("id", id);
  revalidatePath("/menu");
  revalidatePath(`/menu/${id}`);
}

export async function deleteMenuItem(form: FormData) {
  const { supabase } = await requireManager();
  await supabase.from("menu_items").delete().eq("id", String(form.get("id")));
  revalidatePath("/menu");
  redirect("/menu");
}

export async function addRecipeLine(form: FormData) {
  const { supabase } = await requireManager();
  const menuId = String(form.get("menu_item_id"));
  const quantity = n(form.get("quantity"));
  const item_id = String(form.get("item_id") ?? "");
  if (!item_id || !quantity || quantity <= 0) return;
  await supabase.from("recipe_lines").insert({
    menu_item_id: menuId,
    item_id,
    quantity,
    waste_pct: n(form.get("waste_pct")) ?? 0,
    sort: Date.now() % 1_000_000,
  });
  revalidatePath(`/menu/${menuId}`);
  revalidatePath("/menu");
}

export async function updateRecipeLine(form: FormData) {
  const { supabase } = await requireManager();
  const menuId = String(form.get("menu_item_id"));
  const quantity = n(form.get("quantity"));
  if (!quantity || quantity <= 0) return;
  await supabase
    .from("recipe_lines")
    .update({ quantity, waste_pct: n(form.get("waste_pct")) ?? 0 })
    .eq("id", String(form.get("id")));
  revalidatePath(`/menu/${menuId}`);
  revalidatePath("/menu");
}

export async function deleteRecipeLine(form: FormData) {
  const { supabase } = await requireManager();
  const menuId = String(form.get("menu_item_id"));
  await supabase.from("recipe_lines").delete().eq("id", String(form.get("id")));
  revalidatePath(`/menu/${menuId}`);
  revalidatePath("/menu");
}

export async function setMenuFlags(form: FormData) {
  const { supabase } = await requireManager();
  const id = String(form.get("id"));
  await supabase
    .from("menu_items")
    .update({ active: form.get("active") === "on", sold_out: form.get("sold_out") === "on" })
    .eq("id", id);
  revalidatePath(`/menu/${id}`);
  revalidatePath("/menu");
  revalidatePath("/pos");
}

export async function setItemGroups(form: FormData) {
  const { supabase } = await requireManager();
  const id = String(form.get("id"));
  const groups = form.getAll("group").map(String);
  await supabase.from("menu_item_modifier_groups").delete().eq("menu_item_id", id);
  if (groups.length) {
    await supabase.from("menu_item_modifier_groups").insert(groups.map((group_id) => ({ menu_item_id: id, group_id })));
  }
  revalidatePath(`/menu/${id}`);
  revalidatePath("/pos");
}

/** Fixed price per channel; an empty box goes back to the channel's rule. */
export async function setChannelPrices(form: FormData) {
  const { supabase } = await requireManager();
  const id = String(form.get("id"));
  const set: { menu_item_id: string; channel_id: string; price: number }[] = [];
  const clear: string[] = [];
  for (const [k, v] of form.entries()) {
    if (!k.startsWith("p_")) continue;
    const price = n(v);
    if (price == null || price < 0) clear.push(k.slice(2));
    else set.push({ menu_item_id: id, channel_id: k.slice(2), price });
  }
  if (clear.length) await supabase.from("channel_prices").delete().eq("menu_item_id", id).in("channel_id", clear);
  if (set.length) await supabase.from("channel_prices").upsert(set);
  revalidatePath(`/menu/${id}`);
  revalidatePath("/prices");
  revalidatePath("/pos");
}
