import Link from "next/link";
import { requireManager } from "@/lib/session";
import { localName } from "@/lib/i18n";
import { PageHeader } from "@/components/ui";
import SubmitButton from "@/components/submit-button";
import { setCategoryStation, setItemStation } from "./actions";

type Row = { id: string; name: string; name_ar: string | null; category: string | null; station?: string; active?: boolean };

/** Where each menu item is made: bar screens or kitchen screen. */
export default async function StationsPage() {
  const { supabase, t, locale } = await requireManager();
  const { data } = await supabase.from("menu_items").select("*").order("category").order("name");
  const rows = (data ?? []) as Row[];
  const ready = rows.length === 0 || "station" in rows[0];
  const groups = new Map<string, Row[]>();
  for (const m of rows) groups.set(m.category ?? "", [...(groups.get(m.category ?? "") ?? []), m]);

  const label = { bar: `☕ ${t.stationBar}`, kitchen: `🍳 ${t.stationKitchen}` };

  return (
    <>
      <PageHeader
        title={t.stations}
        back="/more"
        action={
          <div className="flex gap-2">
            <Link href="/bar" className="btn-secondary btn-sm">{label.bar}</Link>
            <Link href="/kitchen" className="btn-secondary btn-sm">{label.kitchen}</Link>
          </div>
        }
      />
      <p className="muted mb-4">{t.stationsHint}</p>
      {!ready && <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">⚠️ {t.stationsNotReady}</p>}
      {ready &&
        [...groups.entries()].map(([cat, items]) => {
          const kinds = new Set(items.map((i) => i.station));
          const current = kinds.size === 1 ? [...kinds][0]! : null;
          return (
            <details key={cat} className="card mb-2">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="font-semibold">{cat || t.none}</span>{" "}
                  <span className="muted num">· {items.length}</span>
                  {!current && <span className="badge ms-2 bg-amber-100 text-amber-800">{t.mixed}</span>}
                </span>
                <StationButtons action={setCategoryStation} field="category" value={cat} current={current} labels={label} />
              </summary>
              <ul className="mt-3 divide-y divide-bean-100">
                {items.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2 py-2">
                    <Link href={`/menu/${m.id}`} className={`min-w-0 truncate ${m.active === false ? "text-bean-400" : ""}`}>
                      {localName(m, locale)}
                    </Link>
                    <StationButtons action={setItemStation} field="id" value={m.id} current={m.station ?? null} labels={label} compact />
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
    </>
  );
}

function StationButtons({
  action,
  field,
  value,
  current,
  labels,
  compact,
}: {
  action: (f: FormData) => Promise<void>;
  field: string;
  value: string;
  current: string | null;
  labels: Record<"bar" | "kitchen", string>;
  compact?: boolean;
}) {
  return (
    <div className="seg shrink-0">
      {(["bar", "kitchen"] as const).map((s) => (
        <form key={s} action={action}>
          <input type="hidden" name={field} value={value} />
          <input type="hidden" name="station" value={s} />
          <SubmitButton className={`seg-item ${compact ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm"} ${current === s ? "seg-on" : ""}`}>{labels[s]}</SubmitButton>
        </form>
      ))}
    </div>
  );
}
