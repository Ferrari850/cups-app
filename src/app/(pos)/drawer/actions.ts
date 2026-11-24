"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";

const num = (v: FormDataEntryValue | null) => Number(String(v ?? "").trim().replace(",", ".")) || 0;

export async function openDrawer(form: FormData) {
  const { supabase } = await getSession();
  const { error } = await supabase.rpc("open_register", { p_cash: num(form.get("cash")) });
  revalidatePath("/drawer");
  revalidatePath("/pos");
  if (error) redirect(`/drawer?err=${encodeURIComponent(error.message)}`);
  redirect("/pos");
}

export async function closeDrawer(form: FormData) {
  const { supabase } = await getSession();
  const { data, error } = await supabase.rpc("close_register", {
    p_counted: num(form.get("counted")),
    p_notes: String(form.get("notes") ?? ""),
  });
  revalidatePath("/drawer");
  if (error) redirect(`/drawer?err=${encodeURIComponent(error.message)}`);
  redirect(`/drawer?diff=${Number(data ?? 0).toFixed(2)}`);
}
