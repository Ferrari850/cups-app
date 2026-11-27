import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { missingTable, type Settings } from "@/lib/pos";
import { financeRange, type FinanceReport, type VatSettings } from "@/lib/finance";

export type FinanceSearch = { range?: string; from?: string; to?: string; tab?: string; added?: string };
export type FinanceSettings = Settings & VatSettings;

/** Settings, the chosen period and the finance report, loaded together. */
export async function loadFinance(supabase: SupabaseClient, sp: FinanceSearch) {
  const { data: s, error: se } = await supabase.from("cafe_settings").select("*").maybeSingle();
  if (missingTable(se) || !s || !("vat_emirate" in s)) return { needsDb: true as const };
  const settings = s as FinanceSettings;
  const r = financeRange(sp, settings);
  const [{ data, error }, { data: channels }, { data: pack }] = await Promise.all([
    supabase.rpc("finance_report", { p_from: r.from, p_to: r.to }),
    supabase.from("channels").select("name, name_ar, commission_pct, is_app, active").eq("active", true),
    // Packaging part of cost of goods sold; missing until the packaging update has run.
    supabase.rpc("finance_report_packaging", { p_from: r.from, p_to: r.to }),
  ]);
  if (missingTable(error)) return { needsDb: true as const };
  if (error) throw new Error(error.message);
  return {
    needsDb: false as const,
    settings,
    r,
    rep: { ...(data as FinanceReport), cogs_packaging: Number(pack ?? 0) },
    appsWithoutCommission: ((channels ?? []) as { name: string; name_ar: string | null; commission_pct: number; is_app: boolean }[])
      .filter((c) => c.is_app && Number(c.commission_pct) === 0),
  };
}
