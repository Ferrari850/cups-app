"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { normalizeDigits } from "@/lib/login-id";

export async function updateProfile(_: unknown, form: FormData) {
  const { supabase, profile } = await getSession();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: String(form.get("full_name") ?? "").trim(), phone: String(form.get("phone") ?? "").trim() || null })
    .eq("id", profile.id);
  revalidatePath("/", "layout");
  return { ok: !error, error: error?.message };
}

export async function changePassword(_: unknown, form: FormData) {
  const { supabase } = await getSession();
  const password = normalizeDigits(String(form.get("password") ?? ""));
  if (password.length < 6) return { ok: false, error: "6+" };
  const { error } = await supabase.auth.updateUser({ password });
  return { ok: !error, error: error?.message };
}

/** Managers: a 4-6 digit PIN that approves refunds on a cashier's tablet. */
export async function setPin(_: unknown, form: FormData) {
  const { supabase } = await getSession();
  const { error } = await supabase.rpc("set_my_pin", { p_pin: normalizeDigits(String(form.get("pin") ?? "")) });
  return { ok: !error, error: error?.message };
}
