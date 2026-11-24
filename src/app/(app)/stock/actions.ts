"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManager } from "@/lib/session";

const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim().replace(",", ".");
  return s === "" ? null : Number(s);
};

export async function setMinStock(form: FormData) {
  const { supabase } = await requireManager();
  await supabase
    .from("items")
    .update({ min_stock: num(form.get("min_stock")), track_stock: form.get("track_stock") === "on" })
    .eq("id", String(form.get("id")));
  revalidatePath("/stock");
}

export async function recordWaste(form: FormData) {
  const { supabase } = await requireManager();
  const { error } = await supabase.rpc("record_waste", {
    p_item: String(form.get("item_id")),
    p_qty: num(form.get("qty")),
    p_note: String(form.get("note") ?? ""),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/stock");
}

export async function submitCount(form: FormData) {
  const { supabase } = await requireManager();
  const lines: { item_id: string; counted: string }[] = [];
  for (const [k, v] of form.entries()) {
    if (k.startsWith("c_") && String(v).trim() !== "") lines.push({ item_id: k.slice(2), counted: String(v).trim().replace(",", ".") });
  }
  if (!lines.length) redirect("/stock/count");
  const { error } = await supabase.rpc("submit_count", { p_lines: lines, p_note: String(form.get("note") ?? "") });
  if (error) throw new Error(error.message);
  revalidatePath("/stock");
  redirect("/stock?counted=" + lines.length);
}
