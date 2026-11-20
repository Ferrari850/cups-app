import Link from "next/link";
import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/session";
import { fmtAED, fmtDate } from "@/lib/format";
import { localName } from "@/lib/i18n";
import { Empty, PageHeader } from "@/components/ui";

async function dismiss(form: FormData) {
  "use server";
  const { supabase } = await requireManager();
  const id = String(form.get("id"));
  const q = supabase.from("price_alerts").update({ dismissed_at: new Date().toISOString() }).is("dismissed_at", null);
  await (id === "all" ? q.not("id", "is", null) : q.eq("id", id));
  revalidatePath("/alerts");
  revalidatePath("/");
}

type A = {
  id: string;
  item_id: string;
  old_cost: number;
  new_cost: number;
  change_pct: number;
  created_at: string;
  dismissed_at: string | null;
  items: { name: string; name_ar: string | null; base_unit: string } | null;
  suppliers: { name: string } | null;
};

export default async function AlertsPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const { supabase, t, locale } = await requireManager();
  const all = (await searchParams).all === "1";
  let q = supabase
    .from("price_alerts")
    .select("id, item_id, old_cost, new_cost, change_pct, created_at, dismissed_at, items(name, name_ar, base_unit), suppliers(name)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (!all) q = q.is("dismissed_at", null);
  const { data } = await q;
  const alerts = (data ?? []) as unknown as A[];

  return (
    <>
      <PageHeader
        title={t.alerts}
        back="/more"
        action={
          !all && alerts.length > 1 ? (
            <form action={dismiss}>
              <input type="hidden" name="id" value="all" />
              <button className="btn-secondary btn-sm">{t.dismiss} ✓</button>
            </form>
          ) : null
        }
      />
      <Link href={all ? "/alerts" : "/alerts?all=1"} className="mb-3 inline-block text-sm text-bean-600 underline">
        {all ? t.alerts : t.showDismissed}
      </Link>
      {alerts.length ? (
        <ul className="space-y-2">
          {alerts.map((a) => {
            const mult = a.items?.base_unit === "pcs" ? 1 : 1000;
            const per = a.items?.base_unit === "pcs" ? t.unit_pcs : a.items?.base_unit === "g" ? "kg" : "L";
            const up = a.change_pct > 0;
            return (
              <li key={a.id} className={`card ${a.dismissed_at ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/items/${a.item_id}`} className="font-semibold underline-offset-2 hover:underline">
                    {a.items ? localName(a.items, locale) : "?"}
                  </Link>
                  <span className={`badge num text-sm ${up ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}`}>
                    {up ? "▲ +" : "▼ "}{a.change_pct}%
                  </span>
                </div>
                <div className="num mt-1 text-sm">
                  {t.was} {fmtAED(a.old_cost * mult, locale)} → {t.now} <b>{fmtAED(a.new_cost * mult, locale)}</b> / {per}
                </div>
                <div className="muted mt-1 flex items-center justify-between">
                  <span>{a.suppliers?.name} · {fmtDate(a.created_at, locale)}</span>
                  {!a.dismissed_at && (
                    <form action={dismiss}>
                      <input type="hidden" name="id" value={a.id} />
                      <button className="text-xs underline">{t.dismiss}</button>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty>{t.none}</Empty>
      )}
    </>
  );
}
