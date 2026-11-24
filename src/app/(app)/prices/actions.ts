"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/session";
import { suggestedPrice } from "@/lib/pos";

/** Give every item that has a recipe cost but no menu price the suggested price (cost / target %). */
export async function fillEmptyPrices() {
  const { supabase } = await requireManager();
  const [{ data: menu }, { data: costs }, { data: s }] = await Promise.all([
    supabase.from("menu_items").select("id, selling_price"),
    supabase.from("menu_item_costs").select("menu_item_id, portion_cost, missing_prices, ingredient_count"),
    supabase.from("cafe_settings").select("target_cost_pct").maybeSingle(),
  ]);
  const target = Number(s?.target_cost_pct ?? 30);
  const costBy = new Map((costs ?? []).map((c) => [c.menu_item_id, c]));
  const updates = (menu ?? [])
    .filter((m) => m.selling_price == null)
    .map((m) => {
      const c = costBy.get(m.id);
      if (!c || !c.ingredient_count || c.missing_prices) return null;
      const p = suggestedPrice(Number(c.portion_cost), target);
      return p ? { id: m.id, price: p } : null;
    })
    .filter(Boolean) as { id: string; price: number }[];
  await Promise.all(updates.map((u) => supabase.from("menu_items").update({ selling_price: u.price }).eq("id", u.id)));
  revalidatePath("/prices");
  revalidatePath("/menu");
  revalidatePath("/pos");
}
