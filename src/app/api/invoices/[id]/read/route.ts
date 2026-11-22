import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readInvoice, type KnownItem } from "@/lib/invoice-reader";

export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: isManager } = await supabase.rpc("is_manager");
  if (!isManager) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { data: files } = await supabase.from("invoice_files").select("*").eq("invoice_id", id).order("page_no");
  if (!files?.length) return NextResponse.json({ error: "no files" }, { status: 400 });

  await supabase.from("invoices").update({ status: "reading", error: null }).eq("id", id);

  try {
    const blobs = await Promise.all(
      files.map(async (f) => {
        const { data, error } = await supabase.storage.from("invoices").download(f.storage_path);
        if (error || !data) throw new Error(`Could not open page ${f.page_no}`);
        return { data: Buffer.from(await data.arrayBuffer()), mimeType: f.mime_type as string };
      }),
    );

    const { data: items } = await supabase.from("items").select("id, name, name_ar, base_unit").order("name");
    const known = (items ?? []) as KnownItem[];
    const knownIds = new Set(known.map((k) => k.id));

    const inv = await readInvoice(blobs, known);

    // Supplier: match by tax number, then by name; create when new.
    let supplierId: string | null = null;
    const trn = inv.supplier_trn?.replace(/\D/g, "") || null;
    if (trn) {
      const { data } = await supabase.from("suppliers").select("id").eq("trn", trn).maybeSingle();
      supplierId = data?.id ?? null;
    }
    if (!supplierId && inv.supplier_name) {
      const { data } = await supabase.from("suppliers").select("id").ilike("name", inv.supplier_name.trim()).maybeSingle();
      supplierId = data?.id ?? null;
    }
    if (!supplierId && inv.supplier_name) {
      const { data } = await supabase
        .from("suppliers")
        .insert({ name: inv.supplier_name.trim(), name_ar: inv.supplier_name_ar, trn })
        .select("id")
        .single();
      supplierId = data?.id ?? null;
    }

    // Lines: remembered aliases win over the reader's own guess.
    const { data: aliases } = await supabase.from("item_aliases").select("item_id, supplier_id, raw_name, pack_size");
    const aliasFor = (raw: string) => {
      const key = raw.trim().toLowerCase();
      const list = (aliases ?? []).filter((a) => a.raw_name.trim().toLowerCase() === key);
      return list.find((a) => a.supplier_id === supplierId) ?? list.find((a) => a.supplier_id === null) ?? list[0];
    };

    const baseUnitOf = new Map(known.map((k) => [k.id, k.base_unit]));
    // Catch the classic mix-up: "BUN 400G" counted in pieces but given 400 as the pieces per pack.
    const sanePack = (desc: string, unit: string, pack: number | null) => {
      if (unit !== "pcs" || pack == null) return pack;
      const weights = [...desc.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:g|gm|gr|grams?|ml|kg|l|ltr)\b/gi)].map((m) => Number(m[1].replace(",", ".")));
      return weights.includes(Number(pack)) ? null : pack;
    };
    const lines = inv.lines.map((l, i) => {
      const alias = aliasFor(l.description);
      const itemId = alias?.item_id ?? (l.matched_item_id && knownIds.has(l.matched_item_id) ? l.matched_item_id : null);
      return {
        invoice_id: id,
        line_no: i + 1,
        raw_name: l.description.trim(),
        item_id: l.is_ingredient ? itemId : null,
        quantity: l.quantity,
        unit: l.unit,
        unit_price: l.unit_price ?? (l.line_total != null && l.quantity ? l.line_total / l.quantity : null),
        line_total: l.line_total,
        pack_size:
          alias?.pack_size ??
          sanePack(l.description, (itemId && baseUnitOf.get(itemId)) || l.base_unit, l.pack_size),
        base_unit: (itemId && baseUnitOf.get(itemId)) || l.base_unit,
        skip: !l.is_ingredient,
        suggested_name: l.description_en,
      };
    });

    await supabase.from("invoice_lines").delete().eq("invoice_id", id);
    if (lines.length) {
      const { error } = await supabase.from("invoice_lines").insert(lines);
      if (error) throw new Error(error.message);
    }

    await supabase
      .from("invoices")
      .update({
        status: "review",
        supplier_id: supplierId,
        supplier_name: inv.supplier_name,
        invoice_number: inv.invoice_number,
        invoice_date: /^\d{4}-\d{2}-\d{2}$/.test(inv.invoice_date ?? "") ? inv.invoice_date : null,
        currency: inv.currency || "AED",
        subtotal: inv.subtotal,
        vat: inv.vat,
        total: inv.total,
        ai_notes: inv.notes,
      })
      .eq("id", id);

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "error";
    console.error("invoice read failed", id, e);
    await supabase.from("invoices").update({ status: "failed", error: message }).eq("id", id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
