import Link from "next/link";
import { Icon } from "./icons";

export function PageHeader({ title, back, action }: { title: string; back?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <div className="flex min-w-0 flex-1 basis-48 items-center gap-3">
        {back && (
          <Link href={back} className="icon-btn shrink-0" aria-label="back">
            <Icon name="chevron" className="h-5 w-5 rotate-180 rtl:rotate-0" />
          </Link>
        )}
        <h1 className="h1 min-w-0 break-words">{title}</h1>
      </div>
      {action}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-3xl border-2 border-dashed border-bean-200 p-6 text-center text-sm text-bean-600">{children}</p>;
}

export function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="mb-6">
      <div className="mb-2.5 flex items-center justify-between px-1">
        <h2 className="eyebrow">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function RowLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="card flex items-center justify-between gap-3 transition hover:shadow-float active:scale-[.99]">
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

/** White rounded card with a small capital-letter label and an optional note or link on the other side. */
export function Panel({ title, aside, children, className = "" }: { title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="eyebrow">{title}</h2>
        {aside && <div className="text-xs text-bean-600">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return (
    <span className={`badge ${statusColors[status] ?? "bg-bean-100 text-bean-700"}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {label}
    </span>
  );
}
