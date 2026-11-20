import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { addDays, dubaiDate, dubaiInstant } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import SwapForm from "./swap-form";

export default async function NewSwapPage({ searchParams }: { searchParams: Promise<{ shift?: string }> }) {
  const { supabase, profile, t, locale } = await getSession();
  const { shift: shiftId } = await searchParams;
  if (!shiftId) redirect("/schedule");
  const { data: shift } = await supabase.from("shifts").select("id, staff_id, starts_at, ends_at, station").eq("id", shiftId).single();
  if (!shift || shift.staff_id !== profile.id) redirect("/schedule");

  const [{ data: people }, { data: theirShifts }] = await Promise.all([
    supabase.from("profiles").select("id, full_name").eq("active", true).neq("id", profile.id).order("full_name"),
    supabase
      .from("shifts")
      .select("id, staff_id, starts_at, ends_at")
      .neq("staff_id", profile.id)
      .gte("starts_at", new Date().toISOString())
      .lt("starts_at", dubaiInstant(addDays(dubaiDate(), 28), "00:00"))
      .order("starts_at"),
  ]);

  return (
    <>
      <PageHeader title={t.requestSwap} back="/schedule" />
      <SwapForm t={t} locale={locale} shift={shift} people={people ?? []} theirShifts={theirShifts ?? []} />
    </>
  );
}
