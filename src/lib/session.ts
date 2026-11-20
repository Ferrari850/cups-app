import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { getDict } from "./i18n";
import type { Locale } from "./format";

export type Role = "owner" | "manager" | "staff";
export type Profile = {
  id: string;
  full_name: string;
  phone: string | null;
  role: Role;
  position: string | null;
  locale: Locale;
  active: boolean;
};

export const getLocale = cache(async (): Promise<Locale> => {
  const c = (await cookies()).get("locale")?.value;
  return c === "ar" ? "ar" : "en";
});

/** Signed-in user, profile, language and dictionary. Redirects to /login when signed out. */
export const getSession = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single<Profile>();
  if (!profile || !profile.active) {
    await supabase.auth.signOut();
    redirect("/login");
  }
  const locale = await getLocale();
  const isManager = profile.role === "owner" || profile.role === "manager";
  return { supabase, user, profile, locale, t: getDict(locale), isManager, isOwner: profile.role === "owner" };
});

/** Use on pages and actions that only the owner and managers may open. */
export async function requireManager() {
  const s = await getSession();
  if (!s.isManager) redirect("/");
  return s;
}
