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
export async function placeOrder(
  input: OrderInput,
  draw?: { name: string; phone: string },
): Promise<{ ok: true; order: PlacedOrder; drawError?: string } | { ok: false; error: string }> {
  const { supabase } = await getSession();
  const { data, error } = await supabase.rpc("place_order", { p: input });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/orders");
  const order = data as PlacedOrder;
  // Prize draw details taken on the payment screen: entered straight away, before any receipt prints.
  if (draw && draw.name.trim() && draw.phone.trim()) {
    const res = await supabase.rpc("enter_draw", { p_order: order.id, p_name: draw.name, p_phone: draw.phone });
    if (res.error) return { ok: true, order, drawError: res.error.message };
    revalidatePath("/draw");
  }
  return { ok: true, order };
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

/** Prize draw: the customer chose to give their name and phone for this paid order. */
export async function enterDraw(orderId: string, name: string, phone: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase } = await getSession();
  const { error } = await supabase.rpc("enter_draw", { p_order: orderId, p_name: name, p_phone: phone });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/draw");
  return { ok: true };
}
