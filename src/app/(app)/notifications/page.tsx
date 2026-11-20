import Link from "next/link";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { fmtDate, fmtTime } from "@/lib/format";
import type { DictKey } from "@/lib/i18n";
import { Empty, PageHeader } from "@/components/ui";

async function markAllRead() {
  "use server";
  const { supabase, profile } = await getSession();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", profile.id).is("read_at", null);
  revalidatePath("/", "layout");
}

export default async function NotificationsPage() {
  const { supabase, profile, t, locale } = await getSession();
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const title = (key: string) => (t as Record<string, string>)[`n_${key}` as DictKey] ?? key;

  return (
    <>
      <PageHeader
        title={t.notifications}
        action={
          data?.some((n) => !n.read_at) ? (
            <form action={markAllRead}>
              <button className="btn-secondary btn-sm">{t.markAllRead}</button>
            </form>
          ) : null
        }
      />
      {data?.length ? (
        <ul className="space-y-2">
          {data.map((n) => (
            <li key={n.id}>
              <Link href={n.link ?? "#"} className={`card block ${n.read_at ? "opacity-60" : "ring-bean-300"}`}>
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">{title(n.title)}</span>
                  <span className="muted num shrink-0 text-xs">
                    {fmtDate(n.created_at, locale)} {fmtTime(n.created_at, locale)}
                  </span>
                </div>
                {n.body && <p className="muted mt-1">{n.body}</p>}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>{t.none}</Empty>
      )}
    </>
  );
}
