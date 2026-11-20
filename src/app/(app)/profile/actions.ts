"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";

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
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return { ok: false, error: "8+" };
  const { error } = await supabase.auth.updateUser({ password });
  return { ok: !error, error: error?.message };
}
