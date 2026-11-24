import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { fmtAED } from "@/lib/format";
import { invoiceNo, type Settings } from "@/lib/pos";
import { RECEIPT_SELECT, type ReceiptOrder } from "@/lib/receipt";
import PrintButton from "./print-button";

/** VAT receipt sized for 80 mm receipt paper. Prints from any tablet through the browser. */
export default async function ReceiptPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ print?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { supabase, t } = await getSession();
  const [{ data }, { data: s }] = await Promise.all([
    supabase.from("orders").select(RECEIPT_SELECT).eq("id", id).maybeSingle(),
    supabase.from("cafe_settings").select("*").maybeSingle(),
  ]);
  if (!data) notFound();
  const o = data as unknown as ReceiptOrder;
  const st = s as Settings | null;
  const en = "en" as const;
  const when = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(o.created_at));
  const total = Number(o.total);
  const vat = Number(o.vat);

  return (
    <>
      <div className="mx-auto mb-3 flex max-w-[80mm] gap-2 print:hidden">
        <PrintButton label={t.printReceipt} auto={sp.print === "1"} />
      </div>
      <article className="receipt mx-auto max-w-[80mm] bg-white p-3 font-mono text-[12px] leading-snug text-black shadow-card print:max-w-none print:p-0 print:shadow-none">
        <header className="text-center">
          <div className="text-lg font-bold">{st?.name ?? "CUPS"}</div>
          {st?.name_ar && <div className="text-base font-bold" dir="rtl">{st.name_ar}</div>}
          {st?.address && <div>{st.address}</div>}
          {st?.address_ar && <div dir="rtl">{st.address_ar}</div>}
          {st?.phone && <div className="num">{st.phone}</div>}
          {st?.trn && <div className="num">TRN {st.trn}</div>}
          <div className="mt-1 font-bold">{st?.trn ? "TAX INVOICE · فاتورة ضريبية" : "RECEIPT · إيصال"}</div>
          {o.status === "cancelled" && <div className="mt-1 border border-black font-bold">REFUNDED · مسترد</div>}
        </header>
        <div className="my-2 text-center text-3xl font-extrabold num">#{o.ticket_no}</div>
        <div className="flex justify-between num"><span>{invoiceNo(st?.invoice_prefix, o.invoice_no)}</span><span>{when}</span></div>
        <div className="flex justify-between">
          <span>{o.channels?.name}</span>
          {o.channels?.name_ar && <span dir="rtl">{o.channels.name_ar}</span>}
        </div>
        {(o.car_plate || o.parking_spot) && (
          <div className="num">{[o.car_plate, o.car_color, o.parking_spot && `Spot ${o.parking_spot}`].filter(Boolean).join(" · ")}</div>
        )}
        {o.external_ref && <div className="num">Ref {o.external_ref}</div>}
        {o.customer_name && <div>{o.customer_name}</div>}
        <hr className="my-2 border-dashed border-black" />
        <table className="w-full">
          <tbody>
            {[...o.order_lines].sort((a, b) => a.sort - b.sort).map((l) => (
              <tr key={l.id} className="align-top">
                <td className="num pe-1">{l.qty}×</td>
                <td className="w-full">
                  {l.name}
                  {l.name_ar && <div dir="rtl">{l.name_ar}</div>}
                  {l.modifiers.map((m) => (
                    <div key={m.id} className="ps-2 text-[11px]">+ {m.name}{m.name_ar ? ` / ${m.name_ar}` : ""}</div>
                  ))}
                  {l.note && <div className="ps-2 text-[11px]">* {l.note}</div>}
                </td>
                <td className="num ps-1 text-end whitespace-nowrap">{Number(l.line_total).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <hr className="my-2 border-dashed border-black" />
        <Row l="Subtotal excl. VAT · المجموع قبل الضريبة" r={(total - vat).toFixed(2)} />
        <Row l="VAT 5% · ضريبة القيمة المضافة" r={vat.toFixed(2)} />
        <div className="mt-1 flex justify-between text-base font-extrabold">
          <span>TOTAL · الإجمالي</span>
          <span className="num">{fmtAED(total, en)}</span>
        </div>
        <hr className="my-2 border-dashed border-black" />
        {o.payments.map((p, i) => (
          <Row key={i} l={p.amount < 0 ? `Refund ${p.method}` : p.method === "cash" ? "Cash · نقداً" : p.method === "card" ? "Card · بطاقة" : `${o.channels?.name ?? "App"}`} r={Number(p.amount).toFixed(2)} />
        ))}
        {(st?.receipt_footer || st?.receipt_footer_ar) && (
          <footer className="mt-3 text-center">
            {st?.receipt_footer && <div>{st.receipt_footer}</div>}
            {st?.receipt_footer_ar && <div dir="rtl">{st.receipt_footer_ar}</div>}
          </footer>
        )}
      </article>
    </>
  );
}

function Row({ l, r }: { l: string; r: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span>{l}</span>
      <span className="num">{r}</span>
    </div>
  );
}
