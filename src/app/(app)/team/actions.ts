"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/session";
import { createServiceClient } from "@/lib/supabase/server";
import { displayLogin, toLoginEmail } from "@/lib/login-id";

function tempPassword() {
  const words = ["latte", "mocha", "chai", "karak", "dates", "beans", "cream", "sugar"];
  const w = words[Math.floor(Math.random() * words.length)];
  return `${w}-${Math.floor(1000 + Math.random() * 9000)}`;
}

export async function addStaff(_: unknown, form: FormData) {
  const { isOwner } = await requireManager();
  const email = toLoginEmail(String(form.get("email") ?? ""));
  const full_name = String(form.get("full_name") ?? "").trim();
  const position = String(form.get("position") ?? "").trim() || null;
  const phone = String(form.get("phone") ?? "").trim() || null;
  let role = String(form.get("role") ?? "staff");
  if (role !== "manager" || !isOwner) role = "staff";
  const password = tempPassword();

  const admin = createServiceClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });
  if (error || !data.user) return { ok: false, error: error?.message ?? "error" };
  await admin.from("profiles").update({ full_name, position, phone, role }).eq("id", data.user.id);
  revalidatePath("/team");
  return { ok: true, email: displayLogin(email), password };
}

export async function updateMember(form: FormData) {
  const { supabase, isOwner } = await requireManager();
  const id = String(form.get("id"));
  const patch: Record<string, unknown> = {
    position: String(form.get("position") ?? "").trim() || null,
    phone: String(form.get("phone") ?? "").trim() || null,
  };
  const role = form.get("role");
  if (isOwner && (role === "staff" || role === "manager")) patch.role = role;
  await supabase.from("profiles").update(patch).eq("id", id);
  revalidatePath("/team");
}

export async function setActive(form: FormData) {
  const { supabase } = await requireManager();
  await supabase.from("profiles").update({ active: form.get("active") === "1" }).eq("id", String(form.get("id")));
  revalidatePath("/team");
}

export async function resetPassword(_: unknown, form: FormData) {
  await requireManager();
  const id = String(form.get("id"));
  const admin = createServiceClient();
  const { data: target } = await admin.from("profiles").select("role").eq("id", id).single();
  if (target?.role === "owner") return { ok: false, error: "owner" };
  const password = tempPassword();
  const { error } = await admin.auth.admin.updateUserById(id, { password });
  return error ? { ok: false, error: error.message } : { ok: true, password };
}
