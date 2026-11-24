"use server";

import { getSession } from "@/lib/session";
import { RECEIPT_SELECT, toTicket, type ReceiptOrder } from "@/lib/receipt";
import { ticketXml } from "@/lib/epos";
import type { Settings } from "@/lib/pos";

/** The printer address and the ePOS ticket for one order, for printing over Wi-Fi from the tablet. */
export async function getPrintJob(orderId: string): Promise<{ ip: string | null; xml: string } | null> {
  const { supabase } = await getSession();
  const [{ data: o }, { data: s }] = await Promise.all([
    supabase.from("orders").select(RECEIPT_SELECT).eq("id", orderId).single(),
    supabase.from("cafe_settings").select("*").maybeSingle(),
  ]);
  if (!o) return null;
  const settings = s as Settings | null;
  return { ip: settings?.printer_ip ?? null, xml: ticketXml(toTicket(o as unknown as ReceiptOrder, settings)) };
}
