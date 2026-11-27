import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { fmtAED } from "@/lib/format";
import { invoiceNo, type Settings } from "@/lib/pos";
import { RECEIPT_SELECT, type ReceiptOrder } from "@/lib/receipt";
import PrintButton from "./print-button";

/** A made-up order for "Test print" in Settings, with Arabic, a modifier and a note. */
function sampleOrder(): ReceiptOrder {
  const line = (n: number, name: string, name_ar: string, qty: number, price: number, mods: ReceiptOrder["order_lines"][number]["modifiers"] = [], note: string | null = null) => ({
    id: `l${n}`, name, name_ar, qty, unit_price: price, line_total: qty * price, unit_cost: 0, note, sort: n, modifiers: mods,
  });
  return {
    id: "sample", invoice_no: 0, ticket_no: 0, created_at: new Date().toISOString(), status: "paid",
    total: 50, vat: 2.38, refunded: 0, refund_reason: null, car_plate: null, car_color: null, parking_spot: null,
    customer_name: null, customer_phone: null, external_ref: null, notes: null, staff_id: null,
    channels: { name: "Test print", name_ar: "طباعة تجريبية", code: "test" },
    order_lines: [
      line(1, "Spanish Latte", "سبانش لاتيه", 2, 18, [{ id: "m1", name: "Oat milk", name_ar: "حليب الشوفان", price: 0 }], "Less sugar"),
      line(2, "Pistachio Croissant", "كرواسون فستق", 1, 14),
    ],
    payments: [{ method: "cash", amount: 50, created_at: new Date().toISOString() }],
  };
}

/** VAT receipt for 80 mm thermal paper (72 mm printed). Prints from any device through the browser. */
export default async function ReceiptPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ print?: string; embed?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { supabase, t } = await getSession();
  const sample = id === "sample";
  const [{ data }, { data: s }] = await Promise.all([
    sample ? Promise.resolve({ data: sampleOrder() }) : supabase.from("orders").select(RECEIPT_SELECT).eq("id", id).maybeSingle(),
    supabase.from("cafe_settings").select("*").maybeSingle(),
  ]);
  if (!data) notFound();
  const o = data as unknown as ReceiptOrder;
  const embed = sp.embed === "1";
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
      <div className={embed ? "hidden" : "mx-auto my-3 flex w-[80mm] gap-2 print:hidden"}>
        <PrintButton label={t.printReceipt} auto={sp.print === "1"} embed={embed} />
      </div>
      <article className="receipt" dir="ltr">
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
        {(o.customer_name || o.customer_phone) && (
          <div className="flex justify-between gap-2">
            <span>{o.customer_name}</span>
            {o.customer_phone && <span className="num" dir="ltr">{o.customer_phone}</span>}
          </div>
        )}
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
        {o.in_draw && (
          <div className="mt-3 border-2 border-black p-2 text-center">
            <div className="font-bold">PRIZE DRAW ENTRY · مشارك في السحب</div>
            <div>We will call you if you win · سنتصل بك إذا فزت</div>
            {o.customer_name && <div className="mt-1 font-bold">{o.customer_name}</div>}
            {o.customer_phone && <div className="num text-base font-bold" dir="ltr">{o.customer_phone}</div>}
          </div>
        )}
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
