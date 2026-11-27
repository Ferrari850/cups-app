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
  const row: Record<string, unknown> = read(form);
  // Homemade items deduct their ingredients when sold, unless switched to batch logging later.
  if (form.get("is_prep") === "on") Object.assign(row, { is_prep: true, track_stock: false });
  const { data, error } = await supabase.from("items").insert(row).select("id").single();
  if (error) throw new Error(error.message);
  revalidatePath("/items");
  redirect(`/items/${data.id}`);
}

export async function updateItem(form: FormData) {
  const { supabase } = await requireManager();
  const id = String(form.get("id"));
  const patch: Record<string, unknown> = read(form);
  const prep = form.get("is_prep") === "on";
  // Only send the column when it matters, so this still works before the homemade update runs.
  if (prep || form.get("was_prep") === "1") {
    patch.is_prep = prep;
    if (prep && form.get("was_prep") !== "1") patch.track_stock = false;
  }
  // Packaging switch: only sent once the packaging update has run.
  if (form.get("has_packaging") === "1") patch.is_packaging = form.get("is_packaging") === "on" && !prep;
  // Optional manual price, entered per kg / L / piece for convenience.
  const manual = String(form.get("manual_price") ?? "").trim();
  if (manual && !prep) {
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

const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim().replace(",", ".");
  return s === "" ? null : Number(s);
};

function refresh(id: string) {
  revalidatePath("/items");
  revalidatePath(`/items/${id}`);
  revalidatePath("/menu", "layout");
  revalidatePath("/stock");
}

/** Homemade item: how much one batch makes, and how its stock is kept. */
export async function setPrepSettings(form: FormData) {
  const { supabase } = await requireManager();
  const id = String(form.get("id"));
  const y = num(form.get("batch_yield"));
  const { error } = await supabase
    .from("items")
    .update({ batch_yield: y && y > 0 ? y : null, track_stock: form.get("stock_mode") === "batch" })
    .eq("id", id);
  if (error) throw new Error(error.message);
  refresh(id);
}

export async function addPrepLine(form: FormData) {
  const { supabase } = await requireManager();
  const prep_id = String(form.get("prep_id"));
  const item_id = String(form.get("item_id") ?? "");
  const quantity = num(form.get("quantity"));
  if (!item_id || !quantity || quantity <= 0) return;
  const { error } = await supabase.from("prep_lines").insert({
    prep_id,
    item_id,
    quantity,
    waste_pct: num(form.get("waste_pct")) ?? 0,
    sort: Date.now() % 1_000_000,
  });
  if (error) {
    if (error.message.includes("prep_cycle") || error.code === "23514") redirect(`/items/${prep_id}?err=cycle`);
    throw new Error(error.message);
  }
  refresh(prep_id);
}

export async function updatePrepLine(form: FormData) {
  const { supabase } = await requireManager();
  const prep_id = String(form.get("prep_id"));
  const quantity = num(form.get("quantity"));
  if (!quantity || quantity <= 0) return;
  await supabase
    .from("prep_lines")
    .update({ quantity, waste_pct: num(form.get("waste_pct")) ?? 0 })
    .eq("id", String(form.get("id")));
  refresh(prep_id);
}

export async function deletePrepLine(form: FormData) {
  const { supabase } = await requireManager();
  const prep_id = String(form.get("prep_id"));
  await supabase.from("prep_lines").delete().eq("id", String(form.get("id")));
  refresh(prep_id);
}

/** "Made a batch": homemade item into stock, its ingredients out. */
export async function makeBatch(form: FormData) {
  const { supabase } = await requireManager();
  const id = String(form.get("id"));
  const { error } = await supabase.rpc("make_batch", {
    p_item: id,
    p_batches: num(form.get("batches")) ?? 1,
    p_note: String(form.get("note") ?? ""),
  });
  if (error) throw new Error(error.message);
  refresh(id);
  redirect(`/items/${id}?batch=1`);
}

/** Sell a homemade item on its own: a menu item whose recipe is one portion of it. */
export async function sellOnMenu(form: FormData) {
  const { supabase } = await requireManager();
  const id = String(form.get("id"));
  const quantity = num(form.get("quantity"));
  if (!quantity || quantity <= 0) return;
  const { data: m, error } = await supabase
    .from("menu_items")
    .insert({
      name: String(form.get("name") ?? "").trim(),
      name_ar: String(form.get("name_ar") ?? "").trim() || null,
      category: String(form.get("category") ?? "").trim() || null,
      selling_price: num(form.get("selling_price")),
      yield_portions: 1,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await supabase.from("recipe_lines").insert({ menu_item_id: m.id, item_id: id, quantity, waste_pct: 0, sort: 0 });
  refresh(id);
  redirect(`/menu/${m.id}`);
}
