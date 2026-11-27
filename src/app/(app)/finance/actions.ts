"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManager } from "@/lib/session";
import { EXPENSE_CATEGORIES, VAT_RATE } from "@/lib/finance";

const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").replace(/,/g, ".").replace(/[^\d.]/g, "");
  return s === "" ? null : Number(s);
};

export async function addExpense(form: FormData) {
  const { supabase } = await requireManager();
  const str = (k: string) => String(form.get(k) ?? "").trim() || null;
  const category = String(form.get("category"));
  if (!(EXPENSE_CATEGORIES as readonly string[]).includes(category)) throw new Error("bad category");
  const amount = num(form.get("amount"));
  if (amount == null || !(amount >= 0)) throw new Error("bad amount");
  const hasInvoice = form.get("has_tax_invoice") === "on";
  const typedVat = num(form.get("vat"));
  // Salaries carry no VAT; otherwise work out 5% when a tax invoice is ticked and VAT is left empty.
  const vat = typedVat ?? (hasInvoice && category !== "salaries" ? Math.round(amount * VAT_RATE * 100) / 100 : 0);
  const date = String(form.get("expense_date") ?? "");
  const { error } = await supabase.from("expenses").insert({
    expense_date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined,
    category,
    payee: str("payee"),
    payee_trn: str("payee_trn")?.replace(/\s|-/g, "") ?? null,
    reference: str("reference"),
    description: str("description"),
    amount,
    vat,
    has_tax_invoice: hasInvoice,
    paid_by: str("paid_by"),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/finance");
  redirect(String(form.get("back") || "/finance?tab=costs") + "&added=1");
}

export async function deleteExpense(form: FormData) {
  const { supabase } = await requireManager();
  const { error } = await supabase.from("expenses").delete().eq("id", String(form.get("id")));
  if (error) throw new Error(error.message);
  revalidatePath("/finance");
  redirect(String(form.get("back") || "/finance?tab=costs"));
}
