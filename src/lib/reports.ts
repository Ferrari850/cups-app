import { addDays, dubaiDate } from "./format";

export type Report = {
  totals: { orders: number; sales: number; vat: number; cost: number; commission: number };
  refunds: { orders: number; amount: number };
  by_channel: { code: string; name: string; name_ar: string | null; orders: number; sales: number; vat: number; cost: number; commission: number }[];
  by_item: { id: string; name: string; name_ar: string | null; category: string | null; qty: number; sales: number; cost: number }[];
  by_hour: { hour: number; orders: number; sales: number }[];
  by_day: { day: string; orders: number; sales: number; cost: number }[];
  by_staff: { staff_id: string | null; name: string; orders: number; sales: number }[];
  by_method: { method: string; amount: number }[];
};

export function reportRange(sp: { range?: string; from?: string; to?: string }) {
  const today = dubaiDate();
  const ok = (d?: string) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
  if (ok(sp.from) && ok(sp.to)) return { range: "custom", from: sp.from!, to: sp.to! };
  switch (sp.range) {
    case "yesterday":
      return { range: "yesterday", from: addDays(today, -1), to: addDays(today, -1) };
    case "7d":
      return { range: "7d", from: addDays(today, -6), to: today };
    case "month":
      return { range: "month", from: today.slice(0, 8) + "01", to: today };
    case "30d":
      return { range: "30d", from: addDays(today, -29), to: today };
    default:
      return { range: "today", from: today, to: today };
  }
}

/** Profit after VAT, ingredient cost and app commission. */
export const profit = (r: { sales: number; vat?: number; cost: number; commission?: number }) =>
  Number(r.sales) - Number(r.vat ?? Number(r.sales) - Number(r.sales) / 1.05) - Number(r.cost) - Number(r.commission ?? 0);
