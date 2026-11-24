import { notFound } from "next/navigation";
import { requireManager } from "@/lib/session";
import { fmtAED, fmtDate, fmtNum } from "@/lib/format";
import { localName } from "@/lib/i18n";
import { PageHeader, StatusBadge } from "@/components/ui";
import SubmitButton from "@/components/submit-button";
import { deleteInvoice } from "../actions";
import ReviewForm from "./review-form";
import { Poller, RetryButton } from "./reading";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, t, locale } = await requireManager();
  const [{ data: inv }, { data: lines }, { data: files }, { data: items }, { data: alerts }] = await Promise.all([
    supabase.from("invoices").select("*").eq("id", id).single(),
    supabase.from("invoice_lines").select("*, items(name, name_ar, base_unit)").eq("invoice_id", id).order("line_no"),
    supabase.from("invoice_files").select("storage_path, mime_type, page_no").eq("invoice_id", id).order("page_no"),
    supabase.from("items").select("id, name, name_ar, base_unit").order("name"),
    supabase.from("price_alerts").select("item_id, change_pct").eq("invoice_id", id),
  ]);
  if (!inv) notFound();

  const signed = files?.length
    ? (await supabase.storage.from("invoices").createSignedUrls(files.map((f) => f.storage_path), 3600)).data ?? []
    : [];

  const title = inv.supplier_name ?? t.newInvoice;

  return (
    <>
      <PageHeader title={title} back="/invoices" action={<StatusBadge status={inv.status} label={t[`status_${inv.status as "review"}`]} />} />

      {signed.length > 0 && (
        <details className="card mb-4">
          <summary className="cursor-pointer font-medium">
            {t.viewPages} ({signed.length})
          </summary>
          <div className="mt-3 flex gap-2 overflow-x-auto">
            {signed.map((s, i) =>
              files![i].mime_type === "application/pdf" ? (
                <a key={i} href={s.signedUrl ?? "#"} target="_blank" className="btn-secondary shrink-0">📄 PDF</a>
              ) : (
                <a key={i} href={s.signedUrl ?? "#"} target="_blank" className="shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.signedUrl ?? ""} alt={`page ${i + 1}`} className="h-40 rounded-lg ring-1 ring-bean-100" />
                </a>
              ),
            )}
          </div>
        </details>
      )}

      {inv.status === "reading" && (
        <div className="card flex flex-col items-center gap-4 py-10 text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-bean-200 border-t-bean-700" />
          <p>{t.reading}</p>
          <Poller />
          <RetryButton id={id} label={t.tryAgain} subtle />
        </div>
      )}

      {inv.status === "failed" && (
        <div className="card space-y-3 text-center">
          <p className="font-semibold text-red-700">{t.readFailed}</p>
          {inv.error && <p className="muted">{inv.error}</p>}
          <RetryButton id={id} label={t.tryAgain} />
        </div>
      )}

      {inv.status === "review" && (
        <ReviewForm
          t={t}
          locale={locale}
          invoice={{
            id,
            supplier_name: inv.supplier_name ?? "",
            invoice_number: inv.invoice_number,
            invoice_date: inv.invoice_date,
            subtotal: inv.subtotal,
            vat: inv.vat,
            total: inv.total,
            ai_notes: inv.ai_notes,
          }}
          lines={(lines ?? []).map((l) => ({
            id: l.id,
            raw_name: l.raw_name,
            suggested_name: l.suggested_name,
            item_id: l.item_id,
            quantity: l.quantity,
            unit: l.unit,
            unit_price: l.unit_price,
            line_total: l.line_total,
            pack_size: l.pack_size,
            base_unit: l.base_unit ?? "pcs",
            skip: l.skip,
          }))}
          items={(items ?? []).map((i) => ({ id: i.id, label: localName(i, locale), base_unit: i.base_unit }))}
        />
      )}

      {inv.status === "confirmed" && (
        <div className="space-y-4">
          <div className="card grid grid-cols-2 gap-2 text-sm">
            <div className="muted">{t.invoiceNo}</div>
            <div className="num">{inv.invoice_number ?? "–"}</div>
            <div className="muted">{t.invoiceDate}</div>
            <div className="num">{inv.invoice_date ? fmtDate(inv.invoice_date, locale, { year: "numeric" }) : "–"}</div>
            <div className="muted">{t.subtotal}</div>
            <div className="num">{fmtAED(inv.subtotal, locale)}</div>
            <div className="muted">{t.vat}</div>
            <div className="num">{fmtAED(inv.vat, locale)}</div>
            <div className="muted font-semibold">{t.total}</div>
            <div className="num font-semibold">{fmtAED(inv.total, locale)}</div>
          </div>
          <ul className="space-y-2">
            {(lines ?? []).map((l) => {
              const alert = alerts?.find((a) => a.item_id === l.item_id);
              const unit = l.items?.base_unit ?? l.base_unit;
              return (
                <li key={l.id} className={`card ${l.skip || !l.item_id ? "opacity-60" : ""}`}>
                  <div className="flex justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium">{l.items ? localName(l.items, locale) : l.raw_name}</div>
                      <div className="muted truncate">{l.raw_name}</div>
                    </div>
                    <div className="num shrink-0 text-end">
                      <div>{fmtNum(l.quantity, locale)} × {fmtAED(l.unit_price, locale)}</div>
                      {l.pack_size && l.unit_price != null && (
                        <div className="muted">
                          {fmtAED(Number(l.unit_price) / Number(l.pack_size) * (unit === "pcs" ? 1 : 1000), locale)} / {unit === "pcs" ? t.unit_pcs : unit === "g" ? "kg" : "L"}
                        </div>
                      )}
                    </div>
                  </div>
                  {alert && (
                    <div className={`mt-2 badge ${Number(alert.change_pct) > 0 ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}`}>
                      <span className="num">{Number(alert.change_pct) > 0 ? "▲ +" : "▼ "}{alert.change_pct}%</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {inv.status !== "confirmed" && (
        <form action={deleteInvoice} className="mt-6">
          <input type="hidden" name="id" value={id} />
          <SubmitButton className="btn-danger w-full" confirmText={t.areYouSure}>{t.delete}</SubmitButton>
        </form>
      )}
    </>
  );
}
