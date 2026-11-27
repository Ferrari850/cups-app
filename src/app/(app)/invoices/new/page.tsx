import { requireManager } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import Uploader from "./uploader";

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { t } = await requireManager();
  const kind = (await searchParams).kind === "price_list" ? "price_list" : "invoice";
  return (
    <>
      <PageHeader title={kind === "price_list" ? t.newCostList : t.newInvoice} back="/invoices" />
      <Uploader t={t} kind={kind} />
    </>
  );
}
