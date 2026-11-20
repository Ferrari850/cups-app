"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "./supabase/server";
import { toLoginEmail } from "./login-id";

export async function signIn(_prev: { error?: string } | undefined, form: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: toLoginEmail(String(form.get("email") ?? "")),
    password: String(form.get("password") ?? ""),
  });
  if (error) return { error: "wrongLogin" };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data } = await supabase.from("profiles").select("locale").eq("id", user.id).single();
    if (data?.locale) (await cookies()).set("locale", data.locale, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function setLocale(locale: "en" | "ar") {
  (await cookies()).set("locale", locale, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await supabase.from("profiles").update({ locale }).eq("id", user.id);
  revalidatePath("/", "layout");
}
