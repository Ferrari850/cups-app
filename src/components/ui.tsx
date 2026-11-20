import Link from "next/link";
import { Icon } from "./icons";

export function PageHeader({ title, back, action }: { title: string; back?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        {back && (
          <Link href={back} className="-ms-2 p-2 text-bean-600" aria-label="back">
            <Icon name="chevron" className="h-5 w-5 rotate-180 rtl:rotate-0" />
          </Link>
        )}
        <h1 className="h1">{title}</h1>
      </div>
      {action}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-bean-200 p-6 text-center text-sm text-bean-600">{children}</p>;
}

export function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="h2">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function RowLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="card flex items-center justify-between gap-3 hover:ring-bean-300">
      <div className="min-w-0 flex-1">{children}</div>
      <Icon name="chevron" className="h-5 w-5 shrink-0 text-bean-300 rtl:rotate-180" />
    </Link>
  );
}

const statusColors: Record<string, string> = {
  pending_colleague: "bg-amber-100 text-amber-800",
  pending_manager: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  confirmed: "bg-green-100 text-green-800",
  review: "bg-amber-100 text-amber-800",
  reading: "bg-blue-100 text-blue-800",
  rejected: "bg-red-100 text-red-800",
  declined: "bg-red-100 text-red-800",
  failed: "bg-red-100 text-red-800",
  cancelled: "bg-bean-100 text-bean-700",
};

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return <span className={`badge ${statusColors[status] ?? "bg-bean-100 text-bean-700"}`}>{label}</span>;
}
