import { requireManager } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import Uploader from "./uploader";

export default async function NewInvoicePage() {
  const { t } = await requireManager();
  return (
    <>
      <PageHeader title={t.newInvoice} back="/invoices" />
      <Uploader t={t} />
    </>
  );
}
