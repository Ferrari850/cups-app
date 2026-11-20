"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManager } from "@/lib/session";

export async function createInvoice() {
  const { supabase, profile } = await requireManager();
  const { data, error } = await supabase
    .from("invoices")
    .insert({ uploaded_by: profile.id, status: "reading" })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not create invoice");
  return data.id as string;
}

export async function registerFiles(invoiceId: string, files: { path: string; mime: string }[]) {
  const { supabase } = await requireManager();
  const { error } = await supabase
    .from("invoice_files")
    .insert(files.map((f, i) => ({ invoice_id: invoiceId, storage_path: f.path, mime_type: f.mime, page_no: i + 1 })));
  if (error) throw new Error(error.message);
}

export type LineInput = {
  id: string;
  item_id: string | null; // "__new__" to create one
  new_name?: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  line_total: number | null;
  pack_size: number | null;
  base_unit: "g" | "ml" | "pcs";
  skip: boolean;
};

export type HeaderInput = {
  supplier_name: string;
  invoice_number: string | null;
  invoice_date: string | null;
  subtotal: number | null;
  vat: number | null;
  total: number | null;
};

export async function saveInvoice(id: string, header: HeaderInput, lines: LineInput[], confirm: boolean) {
  const { supabase } = await requireManager();

  // Supplier by name (create when new)
  let supplier_id: string | null = null;
  const sname = header.supplier_name.trim();
  if (sname) {
    const { data: found } = await supabase.from("suppliers").select("id").ilike("name", sname).maybeSingle();
    supplier_id = found?.id ?? null;
    if (!supplier_id) {
      const { data: made } = await supabase.from("suppliers").insert({ name: sname }).select("id").single();
      supplier_id = made?.id ?? null;
    }
  }

  const { error: hErr } = await supabase
    .from("invoices")
    .update({ ...header, supplier_name: sname || null, supplier_id })
    .eq("id", id)
    .eq("status", "review");
  if (hErr) return { ok: false, error: hErr.message };

  for (const l of lines) {
    let itemId = l.item_id;
    if (itemId === "__new__") {
      const name = (l.new_name ?? "").trim();
      if (!name) {
        itemId = null;
      } else {
        const { data: existing } = await supabase.from("items").select("id").ilike("name", name).maybeSingle();
        if (existing) itemId = existing.id;
        else {
          const { data: made, error } = await supabase.from("items").insert({ name, base_unit: l.base_unit }).select("id").single();
          if (error) return { ok: false, error: error.message };
          itemId = made.id;
        }
      }
    }
    const { error } = await supabase
      .from("invoice_lines")
      .update({
        item_id: l.skip ? null : itemId,
        quantity: l.quantity,
        unit: l.unit,
        unit_price: l.unit_price,
        line_total: l.line_total,
        pack_size: l.pack_size,
        base_unit: l.base_unit,
        skip: l.skip,
      })
      .eq("id", l.id)
      .eq("invoice_id", id);
    if (error) return { ok: false, error: error.message };
  }

  let alerts = 0;
  if (confirm) {
    const { data, error } = await supabase.rpc("confirm_invoice", { p_invoice: id });
    if (error) return { ok: false, error: error.message };
    alerts = data as number;
  }
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  return { ok: true, alerts };
}

export async function deleteInvoice(form: FormData) {
  const { supabase } = await requireManager();
  const id = String(form.get("id"));
  const { data: files } = await supabase.from("invoice_files").select("storage_path").eq("invoice_id", id);
  if (files?.length) await supabase.storage.from("invoices").remove(files.map((f) => f.storage_path));
  await supabase.from("invoices").delete().eq("id", id).neq("status", "confirmed");
  revalidatePath("/invoices");
  redirect("/invoices");
}
