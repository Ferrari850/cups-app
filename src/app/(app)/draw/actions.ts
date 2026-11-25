"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManager } from "@/lib/session";

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Picks one random entry between the two dates and shows the winner. */
export async function pickWinner(form: FormData) {
  const { supabase } = await requireManager();
  const from = String(form.get("from") ?? "");
  const to = String(form.get("to") ?? "");
  if (!isDate(from) || !isDate(to)) redirect("/draw");
  const { data, error } = await supabase.rpc("pick_draw_winner", { p_from: from, p_to: to });
  const q = `from=${from}&to=${to}`;
  if (error) redirect(`/draw?${q}&err=${error.message.includes("draw_no_entries") ? "none" : "fail"}`);
  revalidatePath("/draw");
  redirect(`/draw?${q}&won=${(data as { id: string }).id}`);
}

/** Privacy: removes the names and phone numbers entered between the two dates. Past winners stay. */
export async function deleteEntries(form: FormData) {
  const { supabase } = await requireManager();
  const from = String(form.get("from") ?? "");
  const to = String(form.get("to") ?? "");
  if (!isDate(from) || !isDate(to)) redirect("/draw");
  await supabase.from("draw_entries").delete().gte("business_date", from).lte("business_date", to);
  revalidatePath("/draw");
  redirect(`/draw?from=${from}&to=${to}&deleted=1`);
}
