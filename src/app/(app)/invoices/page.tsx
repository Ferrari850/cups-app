import Link from "next/link";
import { requireManager } from "@/lib/session";
import { fmtAED, fmtDate } from "@/lib/format";
import { Empty, PageHeader, RowLink, StatusBadge } from "@/components/ui";
import { Icon } from "@/components/icons";

export default async function InvoicesPage() {
  const { supabase, t, locale } = await requireManager();
  const { data } = await supabase
    .from("invoices")
    .select("id, kind, supplier_name, invoice_number, invoice_date, total, status, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  return (
    <>
      <PageHeader title={t.invoices} />
      <div className="mb-4 grid grid-cols-2 gap-2">
        <Link href="/invoices/new" className="btn-primary py-4 text-base">
          <Icon name="camera" className="h-6 w-6" /> {t.newInvoice}
        </Link>
        <Link href="/invoices/new?kind=price_list" className="btn-secondary bg-surface py-4 text-base shadow-card">
          <Icon name="receipt" className="h-6 w-6" /> {t.newCostList}
        </Link>
      </div>
      {data?.length ? (
        <ul className="space-y-2">
          {data.map((i) => (
            <li key={i.id}>
              <RowLink href={`/invoices/${i.id}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-semibold">{i.supplier_name ?? (i.kind === "price_list" ? t.costList : "…")}</span>
                    {i.kind === "price_list" && <span className="badge shrink-0 bg-bean-100 text-bean-700">{t.costList}</span>}
                  </span>
                  <StatusBadge status={i.status} label={t[`status_${i.status as "review"}`]} />
                </div>
                <div className="muted flex justify-between gap-2">
                  <span className="num">
                    {fmtDate(i.invoice_date ?? i.created_at, locale, { year: "numeric" })}
                    {i.invoice_number && ` · #${i.invoice_number}`}
                  </span>
                  <span className="num font-medium text-bean-800">{i.kind === "price_list" ? "" : fmtAED(i.total, locale)}</span>
                </div>
              </RowLink>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>{t.none}</Empty>
      )}
    </>
  );
}
