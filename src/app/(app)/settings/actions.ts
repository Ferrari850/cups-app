"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManager } from "@/lib/session";

export async function saveSettings(form: FormData) {
  const { supabase } = await requireManager();
  const s = (k: string) => String(form.get(k) ?? "").trim() || null;
  const n = (k: string, d: number) => Number(String(form.get(k) ?? "").replace(",", ".")) || d;
  const { error } = await supabase
    .from("cafe_settings")
    .update({
      name: s("name") ?? "CUPS",
      name_ar: s("name_ar"),
      trn: s("trn"),
      address: s("address"),
      address_ar: s("address_ar"),
      phone: s("phone"),
      receipt_footer: s("receipt_footer"),
      receipt_footer_ar: s("receipt_footer_ar"),
      invoice_prefix: String(form.get("invoice_prefix") ?? "").trim(),
      printer_ip: s("printer_ip"),
      target_cost_pct: n("target_cost_pct", 30),
      margin_alert_pct: n("margin_alert_pct", 35),
      // Only sent once the prize draw columns exist (migration 0004).
      ...(form.has("draw_min_total") ? { draw_enabled: form.get("draw_enabled") === "on", draw_min_total: n("draw_min_total", 50) } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
  redirect("/settings?saved=1");
}
