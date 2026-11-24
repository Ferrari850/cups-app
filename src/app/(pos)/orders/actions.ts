"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";

export async function refundOrder(_prev: { error?: string; ok?: boolean } | undefined, form: FormData) {
  const { supabase } = await getSession();
  const id = String(form.get("id"));
  const { error } = await supabase.rpc("refund_order", {
    p_order: id,
    p_pin: String(form.get("pin") ?? ""),
    p_reason: String(form.get("reason") ?? ""),
    p_restock: form.get("restock") === "on",
  });
  if (error) return { error: error.message.includes("manager_pin") ? "pin" : error.message };
  revalidatePath(`/orders/${id}`);
  revalidatePath("/orders");
  return { ok: true };
}
