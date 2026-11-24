/** Shared POS types and the price rule (mirrors public.channel_price in the database). */

export type Channel = {
  id: string;
  code: string;
  name: string;
  name_ar: string | null;
  price_multiplier: number;
  round_to: number;
  commission_pct: number;
  needs_car: boolean;
  is_app: boolean;
  active: boolean;
  sort: number;
};

export type PosItem = {
  id: string;
  name: string;
  name_ar: string | null;
  category: string | null;
  selling_price: number | null;
  sold_out: boolean;
  image_url: string | null;
  groups: string[];
  fixed: Record<string, number>; // channel id -> fixed price
};

export type ModGroup = {
  id: string;
  name: string;
  name_ar: string | null;
  min_select: number;
  max_select: number;
  options: { id: string; name: string; name_ar: string | null; price_delta: number }[];
};

export type Settings = {
  name: string;
  name_ar: string | null;
  trn: string | null;
  address: string | null;
  address_ar: string | null;
  phone: string | null;
  receipt_footer: string | null;
  receipt_footer_ar: string | null;
  invoice_prefix: string;
  printer_ip: string | null;
  target_cost_pct: number;
  margin_alert_pct: number;
};

export function channelPrice(base: number | null | undefined, ch: Pick<Channel, "price_multiplier" | "round_to">) {
  if (base == null) return null;
  const raw = Math.round(Number(base) * Number(ch.price_multiplier) * 10000) / 10000;
  const step = Number(ch.round_to) || 0;
  if (step > 0) return Math.round(Math.ceil(raw / step - 1e-9) * step * 100) / 100;
  return Math.round(raw * 100) / 100;
}

export function itemPrice(item: PosItem, ch: Channel) {
  return item.fixed[ch.id] ?? channelPrice(item.selling_price, ch);
}

/** Suggested menu price from the recipe cost: cost (ex VAT) / target share, plus VAT, rounded up to 0.50. */
export function suggestedPrice(cost: number, targetPct: number) {
  if (!cost || !targetPct) return null;
  return Math.ceil(((cost / (targetPct / 100)) * 1.05) * 2) / 2;
}

/** True when a Postgres/PostgREST error means the new POS tables are not in the database yet. */
export function missingTable(error: { code?: string } | null | undefined) {
  return !!error && (error.code === "42P01" || error.code === "PGRST205" || error.code === "42703" || error.code === "PGRST202");
}

export const invoiceNo = (prefix: string | null | undefined, n: number | string) =>
  `${prefix ?? ""}${String(n).padStart(6, "0")}`;
