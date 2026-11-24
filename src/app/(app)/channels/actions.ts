"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/session";

const num = (v: FormDataEntryValue | null, d: number) => {
  const x = String(v ?? "").trim().replace(",", ".");
  return x === "" || Number.isNaN(Number(x)) ? d : Number(x);
};

export async function saveChannel(form: FormData) {
  const { supabase } = await requireManager();
  const id = String(form.get("id") ?? "");
  const name = String(form.get("name") ?? "").trim();
  const row = {
    name,
    name_ar: String(form.get("name_ar") ?? "").trim() || null,
    price_multiplier: num(form.get("price_multiplier"), 1),
    round_to: num(form.get("round_to"), 0),
    commission_pct: num(form.get("commission_pct"), 0),
    needs_car: form.get("needs_car") === "on",
    is_app: form.get("is_app") === "on",
    active: form.get("active") === "on",
    sort: num(form.get("sort"), 0),
  };
  if (id) await supabase.from("channels").update(row).eq("id", id);
  else await supabase.from("channels").insert({ ...row, code: name.toLowerCase().replace(/[^a-z0-9]+/g, "_") || crypto.randomUUID().slice(0, 8) });
  revalidatePath("/channels");
  revalidatePath("/prices");
  revalidatePath("/pos");
}
