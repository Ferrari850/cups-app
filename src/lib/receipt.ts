import type { Ticket } from "./epos";
import { invoiceNo, type Settings } from "./pos";

export type ReceiptOrder = {
  id: string;
  invoice_no: number;
  ticket_no: number;
  created_at: string;
  status: string;
  total: number;
  vat: number;
  refunded: number;
  refund_reason: string | null;
  car_plate: string | null;
  car_color: string | null;
  parking_spot: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  in_draw?: boolean; // after migration 0004
  external_ref: string | null;
  notes: string | null;
  staff_id: string | null;
  channels: { name: string; name_ar: string | null; code: string } | null;
  order_lines: {
    id: string;
    name: string;
    name_ar: string | null;
    qty: number;
    unit_price: number;
    line_total: number;
    unit_cost: number;
    note: string | null;
    sort: number;
    modifiers: { id: string; name: string; name_ar: string | null; price: number }[];
  }[];
  payments: { method: string; amount: number; created_at: string }[];
};

export const RECEIPT_SELECT =
  "*, channels(name, name_ar, code), order_lines(id, name, name_ar, qty, unit_price, line_total, unit_cost, note, sort, modifiers), payments(method, amount, created_at)";

const money = (n: number) => Number(n).toFixed(2);

export function toTicket(o: ReceiptOrder, s: Settings | null): Ticket {
  const d = new Date(o.created_at);
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  const car = [o.car_plate, o.car_color, o.parking_spot && `Spot ${o.parking_spot}`].filter(Boolean).join(" ");
  return {
    cafe: s?.name ?? "CUPS",
    title: s?.trn ? "TAX INVOICE" : "RECEIPT",
    trn: s?.trn,
    address: s?.address,
    invoice: invoiceNo(s?.invoice_prefix, o.invoice_no),
    ticket: o.ticket_no,
    date,
    channel: o.channels?.name ?? "",
    car: car || null,
    lines: [...o.order_lines]
      .sort((a, b) => a.sort - b.sort)
      .map((l) => ({ qty: l.qty, name: l.name, mods: l.modifiers.map((m) => m.name), total: money(l.line_total), note: l.note })),
    total: money(o.total),
    vat: money(o.vat),
    net: money(Number(o.total) - Number(o.vat)),
    payments: o.payments.map((p) => ({ label: p.method.toUpperCase(), amount: money(p.amount) })),
    customer: [o.customer_name, o.customer_phone].filter(Boolean).join("  ") || null,
    draw: !!o.in_draw,
    footer: s?.receipt_footer,
  };
}
