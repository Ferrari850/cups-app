"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";

export async function requestSwap(_: unknown, form: FormData) {
  const { supabase } = await getSession();
  const { error } = await supabase.rpc("request_swap", {
    p_shift: String(form.get("shift_id")),
    p_target: String(form.get("target_id")),
    p_target_shift: String(form.get("target_shift_id") ?? "") || null,
    p_message: String(form.get("message") ?? "").trim() || null,
  });
  revalidatePath("/swaps");
  return { ok: !error, error: error?.message };
}

export async function respondSwap(form: FormData) {
  const { supabase } = await getSession();
  await supabase.rpc("respond_swap", { p_id: String(form.get("id")), p_accept: form.get("accept") === "1" });
  revalidatePath("/swaps");
  revalidatePath("/schedule");
}

export async function decideSwap(form: FormData) {
  const { supabase } = await getSession();
  await supabase.rpc("decide_swap", { p_id: String(form.get("id")), p_approve: form.get("approve") === "1" });
  revalidatePath("/swaps");
  revalidatePath("/schedule");
}

export async function cancelSwap(form: FormData) {
  const { supabase } = await getSession();
  await supabase.rpc("cancel_swap", { p_id: String(form.get("id")) });
  revalidatePath("/swaps");
}
