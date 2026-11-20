/** UAE VAT. Menu prices include it; costs from invoices exclude it. */
export const VAT = 0.05;

/** Ingredient cost as a share of the selling price before VAT. */
export function costPct(cost: number, sellingInclVat: number | null) {
  if (!sellingInclVat) return null;
  return (cost / (sellingInclVat / (1 + VAT))) * 100;
}

export function pctColor(p: number | null) {
  if (p == null) return "text-bean-500";
  if (p <= 25) return "text-green-700";
  if (p <= 35) return "text-amber-700";
  return "text-red-700";
}
