import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { fmtAED, fmtDate, fmtTime } from "@/lib/format";
import { localName } from "@/lib/i18n";
import { invoiceNo } from "@/lib/pos";
import { RECEIPT_SELECT, type ReceiptOrder } from "@/lib/receipt";
import RefundForm from "./refund-form";
import WifiPrint from "./wifi-print";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, t, locale, isManager } = await getSession();
  const [{ data }, { data: s }] = await Promise.all([
    supabase.from("orders").select(RECEIPT_SELECT).eq("id", id).maybeSingle(),
    supabase.from("cafe_settings").select("invoice_prefix, printer_ip").maybeSingle(),
  ]);
  if (!data) notFound();
  const o = data as unknown as ReceiptOrder;
  const { data: staff } = o.staff_id ? await supabase.from("profiles").select("full_name").eq("id", o.staff_id).maybeSingle() : { data: null };
  const cost = o.order_lines.reduce((sum, l) => sum + Number(l.unit_cost) * l.qty, 0);

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-3 flex items-center justify-between">
        <Link href="/orders" className="btn-secondary btn-sm">‹ {t.orders}</Link>
        <span className="muted num">{invoiceNo(s?.invoice_prefix, o.invoice_no)}</span>
      </div>
      <div className="card mb-3">
        <div className="flex items-start justify-between">
          <div>
            <div className="num text-4xl font-extrabold">#{o.ticket_no}</div>
            <div className="muted">
              {o.channels ? localName(o.channels, locale) : ""} · {fmtDate(o.created_at, locale)} <span className="num">{fmtTime(o.created_at, locale)}</span>
              {staff?.full_name && <> · {staff.full_name}</>}
            </div>
          </div>
          <span className="badge bg-bean-100 text-bean-700">{t[`os_${o.status}` as "os_done"]}</span>
        </div>
        {(o.car_plate || o.customer_name || o.external_ref) && (
          <p className="tile mt-2 text-sm">
            {[o.car_plate, o.car_color, o.parking_spot && `${t.spot} ${o.parking_spot}`, o.customer_name, o.customer_phone, o.external_ref].filter(Boolean).join(" · ")}
          </p>
        )}
        <ul className="mt-3 divide-y divide-bean-100">
          {[...o.order_lines].sort((a, b) => a.sort - b.sort).map((l) => (
            <li key={l.id} className="flex justify-between gap-2 py-2">
              <div>
                <b className="num">{l.qty}×</b> {localName(l, locale)}
                {l.modifiers.length > 0 && <div className="muted text-xs">{l.modifiers.map((m) => localName(m, locale)).join(" · ")}</div>}
                {l.note && <div className="text-xs text-amber-800">* {l.note}</div>}
              </div>
              <span className="num font-semibold">{fmtAED(l.line_total, locale)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex justify-between border-t border-bean-100 pt-2 text-lg font-extrabold">
          <span>{t.total}</span>
          <span className="num">{fmtAED(o.total, locale)}</span>
        </div>
        <div className="muted num flex justify-between text-xs">
          <span>{t.vatIncluded} {fmtAED(o.vat, locale)}</span>
          {isManager && <span>{t.cost} {fmtAED(cost, locale)}</span>}
        </div>
        <ul className="mt-2 space-y-0.5 text-sm">
          {o.payments.map((p, i) => (
            <li key={i} className="flex justify-between">
              <span>{p.amount < 0 ? `${t.refund} · ` : ""}{t[`pay_${p.method}` as "pay_cash"]}</span>
              <span className="num">{fmtAED(p.amount, locale)}</span>
            </li>
          ))}
        </ul>
        {o.refund_reason && <p className="mt-2 text-sm text-red-700">{t.refund}: {o.refund_reason}</p>}
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <a href={`/receipt/${o.id}?print=1`} target="_blank" className="btn-secondary">{t.printReceipt}</a>
        {s?.printer_ip ? <WifiPrint id={o.id} t={t} /> : <span />}
      </div>
      {o.status !== "cancelled" && <RefundForm id={o.id} t={t} isManager={isManager} />}
    </div>
  );
}
