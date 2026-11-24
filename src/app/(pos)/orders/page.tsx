import Link from "next/link";
import { getSession } from "@/lib/session";
import { dubaiDate, fmtAED, fmtTime, addDays } from "@/lib/format";
import { missingTable } from "@/lib/pos";
import { DbUpdateNeeded } from "@/components/db-update";
import { Empty, StatusBadge } from "@/components/ui";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const { supabase, t, locale } = await getSession();
  const today = dubaiDate();
  const sp = await searchParams;
  const day = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : today;
  const { data, error } = await supabase
    .from("orders")
    .select("id, ticket_no, status, total, created_at, car_plate, external_ref, customer_name, channels(name, name_ar)")
    .eq("business_date", day)
    .order("created_at", { ascending: false })
    .limit(500);
  if (missingTable(error)) return <DbUpdateNeeded text={t.dbUpdateNeeded} />;
  type Row = { id: string; ticket_no: number; status: string; total: number; created_at: string; car_plate: string | null; external_ref: string | null; customer_name: string | null; channels: { name: string; name_ar: string | null } | null };
  const rows = (data ?? []) as unknown as Row[];
  const sales = rows.filter((r) => r.status !== "cancelled").reduce((s, r) => s + Number(r.total), 0);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="seg">
          <Link href={`/orders?day=${addDays(day, -1)}`} className="seg-item">‹</Link>
          <span className="seg-item seg-on num">{day === today ? t.today : day}</span>
          {day < today && <Link href={`/orders?day=${addDays(day, 1)}`} className="seg-item">›</Link>}
        </div>
        <div className="text-end">
          <div className="eyebrow">{t.sales}</div>
          <div className="num text-xl font-extrabold">{fmtAED(sales, locale)}</div>
        </div>
      </div>
      {rows.length === 0 && <Empty>{t.noOrders}</Empty>}
      <ul className="space-y-1.5">
        {rows.map((o) => (
          <li key={o.id}>
            <Link href={`/orders/${o.id}`} className="card flex items-center gap-3 p-3">
              <span className="num w-14 text-2xl font-extrabold">#{o.ticket_no}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">
                  {o.channels ? (locale === "ar" && o.channels.name_ar ? o.channels.name_ar : o.channels.name) : ""}
                  {o.car_plate && <span className="num"> · {o.car_plate}</span>}
                  {o.external_ref && <span className="num"> · {o.external_ref}</span>}
                  {o.customer_name && <> · {o.customer_name}</>}
                </div>
                <div className="muted num">{fmtTime(o.created_at, locale)}</div>
              </div>
              <StatusBadge status={o.status === "cancelled" ? "rejected" : o.status === "done" ? "approved" : "review"} label={t[`os_${o.status}` as "os_done"]} />
              <span className={`num font-bold ${o.status === "cancelled" ? "text-bean-500 line-through" : ""}`}>{fmtAED(o.total, locale)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
