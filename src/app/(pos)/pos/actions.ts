"use server";

import { revalidatePath } from "next/cache";
import { getSession, requireManager } from "@/lib/session";

export type OrderInput = {
  channel_id: string;
  lines: { menu_item_id: string; qty: number; options: string[]; note?: string }[];
  payments: { method: "cash" | "card" | "app"; amount: number }[];
  car_plate?: string;
  car_color?: string;
  parking_spot?: string;
  customer_name?: string;
  customer_phone?: string;
  external_ref?: string;
  notes?: string;
};

export type PlacedOrder = { id: string; ticket_no: number; invoice_no: number; total: number };

/** Sends the order to the database, which prices it, takes stock out and records the payment. */
export async function placeOrder(input: OrderInput): Promise<{ ok: true; order: PlacedOrder } | { ok: false; error: string }> {
  const { supabase } = await getSession();
  const { data, error } = await supabase.rpc("place_order", { p: input });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/orders");
  return { ok: true, order: data as PlacedOrder };
}

export type PastOrder = {
  id: string;
  created_at: string;
  customer_name: string | null;
  car_color: string | null;
  lines: { menu_item_id: string | null; name: string; name_ar: string | null; qty: number; modifiers: { id: string }[] }[];
};

/** "Your usual?": the last 3 orders for a car plate. */
export async function lookupPlate(plate: string): Promise<PastOrder[]> {
  const { supabase } = await getSession();
  const p = plate.trim().toUpperCase();
  if (p.length < 2) return [];
  const { data } = await supabase.rpc("plate_history", { p_plate: p });
  return (data ?? []) as PastOrder[];
}

export async function setSoldOut(id: string, soldOut: boolean) {
  const { supabase } = await requireManager();
  await supabase.from("menu_items").update({ sold_out: soldOut }).eq("id", id);
  revalidatePath("/pos");
}
