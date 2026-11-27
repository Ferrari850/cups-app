"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Dict } from "@/lib/i18n";
import { fmtAED, type Locale } from "@/lib/format";
import { saveInvoice, type LineInput } from "../actions";

type BaseUnit = "g" | "ml" | "pcs";
type Line = LineInput & { raw_name: string; suggested_name: string | null; applied?: boolean };
type Item = { id: string; label: string; base_unit: string };

const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

export default function ReviewForm({
  t,
  locale,
  invoice,
  lines: initial,
  items,
}: {
  t: Dict;
  locale: Locale;
  invoice: {
    id: string;
    supplier_name: string;
    invoice_number: string | null;
    invoice_date: string | null;
    subtotal: number | null;
    vat: number | null;
    total: number | null;
    ai_notes: string | null;
  };
  lines: Line[];
  items: Item[];
}) {
  const router = useRouter();
  const [header, setHeader] = useState({
    supplier_name: invoice.supplier_name,
    invoice_number: invoice.invoice_number ?? "",
    invoice_date: invoice.invoice_date ?? "",
    subtotal: invoice.subtotal?.toString() ?? "",
    vat: invoice.vat?.toString() ?? "",
    total: invoice.total?.toString() ?? "",
  });
  const [lines, setLines] = useState<Line[]>(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const itemUnit = useMemo(() => new Map(items.map((i) => [i.id, i.base_unit as BaseUnit])), [items]);
  const unlinked = lines.filter((l) => !l.applied && !l.skip && !l.item_id).length;

  const update = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  function submit(confirm: boolean) {
    setMsg(null);
    start(async () => {
      const res = await saveInvoice(
        invoice.id,
        {
          supplier_name: header.supplier_name,
          invoice_number: header.invoice_number || null,
          invoice_date: header.invoice_date || null,
          subtotal: num(header.subtotal),
          vat: num(header.vat),
          total: num(header.total),
        },
        lines.filter((l) => !l.applied).map((l) => ({
          id: l.id, item_id: l.item_id, new_name: l.new_name, quantity: l.quantity, unit: l.unit,
          unit_price: l.unit_price, line_total: l.line_total, pack_size: l.pack_size, base_unit: l.base_unit, skip: l.skip,
        })),
        confirm,
      );
      if (!res.ok) setMsg({ ok: false, text: res.error ?? t.error });
      else if (confirm) {
        setMsg({ ok: true, text: `${t.confirmed}. ${res.alerts} ${t.priceChangesFound}.` });
        router.refresh();
      } else setMsg({ ok: true, text: "✓" });
    });
  }

  return (
    <div className="space-y-4">
      <div className="card grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="label">{t.supplier}</label>
          <input className="input" value={header.supplier_name} onChange={(e) => setHeader({ ...header, supplier_name: e.target.value })} />
        </div>
        <div>
          <label className="label">{t.invoiceNo}</label>
          <input className="input num" value={header.invoice_number} onChange={(e) => setHeader({ ...header, invoice_number: e.target.value })} />
        </div>
        <div>
          <label className="label">{t.invoiceDate}</label>
          <input type="date" className="input num" value={header.invoice_date} onChange={(e) => setHeader({ ...header, invoice_date: e.target.value })} />
        </div>
        {(["subtotal", "vat", "total"] as const).map((k) => (
          <div key={k} className={k === "total" ? "col-span-2" : ""}>
            <label className="label">{t[k]}</label>
            <input inputMode="decimal" className="input num" value={header[k]} onChange={(e) => setHeader({ ...header, [k]: e.target.value })} />
          </div>
        ))}
      </div>

      {invoice.ai_notes && (
        <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          <b>{t.aiNotes}:</b> {invoice.ai_notes}
        </div>
      )}
      <p className="muted">{t.reviewHint}</p>

      <ul className="space-y-3">
        {lines.map((l, i) => {
          const unit = (l.item_id && l.item_id !== "__new__" ? itemUnit.get(l.item_id) : null) ?? l.base_unit;
          const per =
            l.unit_price != null && l.pack_size ? (l.unit_price / l.pack_size) * (unit === "pcs" ? 1 : 1000) : null;
          if (l.applied)
            return (
              <li key={l.id} className="card flex items-center justify-between gap-2 opacity-70">
                <div className="min-w-0">
                  <div className="truncate font-medium" dir="auto">{items.find((it) => it.id === l.item_id)?.label ?? l.raw_name}</div>
                  <div className="muted truncate" dir="auto">{l.raw_name}</div>
                </div>
                <span className="badge shrink-0 bg-green-100 text-green-800">✓ {t.alreadySaved}</span>
              </li>
            );
          return (
            <li key={l.id} className={`card space-y-3 ${l.skip ? "opacity-60" : !l.item_id ? "ring-2 ring-amber-300" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium" dir="auto">{l.raw_name}</div>
                  {l.suggested_name && l.suggested_name !== l.raw_name && <div className="muted">{l.suggested_name}</div>}
                </div>
                <label className="flex shrink-0 items-center gap-1 text-xs text-bean-600">
                  <input type="checkbox" checked={l.skip} onChange={(e) => update(i, { skip: e.target.checked })} className="accent-bean-700" />
                  {t.skip}
                </label>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-bean-600">{t.qty}</label>
                  <input inputMode="decimal" className="input num min-h-9" value={l.quantity ?? ""} onChange={(e) => update(i, { quantity: num(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs text-bean-600">{t.unit}</label>
                  <input className="input min-h-9" value={l.unit ?? ""} onChange={(e) => update(i, { unit: e.target.value || null })} />
                </div>
                <div>
                  <label className="text-xs text-bean-600">{t.unitPrice}</label>
                  <input inputMode="decimal" className="input num min-h-9" value={l.unit_price ?? ""} onChange={(e) => update(i, { unit_price: num(e.target.value) })} />
                </div>
              </div>

              {!l.skip && (
                <>
                  <div>
                    <label className="text-xs text-bean-600">{t.linkTo}</label>
                    <select
                      className="input min-h-9"
                      value={l.item_id ?? ""}
                      onChange={(e) => {
                        const v = e.target.value || null;
                        update(i, {
                          item_id: v,
                          new_name: v === "__new__" ? (l.new_name ?? l.suggested_name ?? l.raw_name) : undefined,
                          base_unit: (v && v !== "__new__" && itemUnit.get(v)) || l.base_unit,
                        });
                      }}
                    >
                      <option value="">—</option>
                      <option value="__new__">{t.newItem}</option>
                      {items.map((it) => (
                        <option key={it.id} value={it.id}>{it.label}</option>
                      ))}
                    </select>
                  </div>
                  {l.item_id === "__new__" && (
                    <div className="grid grid-cols-3 gap-2">
                      <input className="input col-span-2 min-h-9" value={l.new_name ?? ""} onChange={(e) => update(i, { new_name: e.target.value })} placeholder={t.name} />
                      <select className="input min-h-9" value={l.base_unit} onChange={(e) => update(i, { base_unit: e.target.value as BaseUnit })}>
                        <option value="g">{t.unit_g}</option>
                        <option value="ml">{t.unit_ml}</option>
                        <option value="pcs">{t.unit_pcs}</option>
                      </select>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <span className="shrink-0">1 {l.unit || t.unit} =</span>
                    <input inputMode="decimal" className="input num min-h-9 w-28" value={l.pack_size ?? ""} onChange={(e) => update(i, { pack_size: num(e.target.value) })} />
                    <span className="shrink-0">{t[`unit_${unit}`]}</span>
                  </div>
                  {per != null && (
                    <div className="muted num">
                      = {fmtAED(per, locale)} {t.perUnit} {unit === "pcs" ? t.unit_pcs : unit === "g" ? "kg" : "L"}
                    </div>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>

      {unlinked > 0 && (
        <p className="text-sm text-amber-800">
          {unlinked} {t.unlinkedLines}
        </p>
      )}
      {msg && <p className={`text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</p>}
      <div className="sticky bottom-20 flex gap-2 rounded-2xl bg-bean-50/95 py-2 backdrop-blur">
        <button className="btn-secondary" disabled={pending} onClick={() => submit(false)}>{t.save}</button>
        <button className="btn-primary flex-1" disabled={pending} onClick={() => submit(true)}>
          {pending ? t.saving : t.confirmInvoice}
        </button>
      </div>
    </div>
  );
}
