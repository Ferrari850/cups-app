import Link from "next/link";
import { requireManager } from "@/lib/session";
import { fmtAED, fmtDate } from "@/lib/format";
import { Empty, PageHeader, RowLink, StatusBadge } from "@/components/ui";
import { Icon } from "@/components/icons";

export default async function InvoicesPage() {
  const { supabase, t, locale } = await requireManager();
  const { data } = await supabase
    .from("invoices")
    .select("id, supplier_name, invoice_number, invoice_date, total, status, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  return (
    <>
      <PageHeader title={t.invoices} />
      <Link href="/invoices/new" className="btn-primary mb-4 w-full py-4 text-base">
        <Icon name="camera" className="h-6 w-6" /> {t.newInvoice}
      </Link>
      {data?.length ? (
        <ul className="space-y-2">
          {data.map((i) => (
            <li key={i.id}>
              <RowLink href={`/invoices/${i.id}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold">{i.supplier_name ?? "…"}</span>
                  <StatusBadge status={i.status} label={t[`status_${i.status as "review"}`]} />
                </div>
                <div className="muted flex justify-between gap-2">
                  <span className="num">
                    {fmtDate(i.invoice_date ?? i.created_at, locale, { year: "numeric" })}
                    {i.invoice_number && ` · #${i.invoice_number}`}
                  </span>
                  <span className="num font-medium text-bean-800">{fmtAED(i.total, locale)}</span>
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
