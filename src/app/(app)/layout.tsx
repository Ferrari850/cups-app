import Link from "next/link";
import { getAuth, getSession } from "@/lib/session";
import BottomNav, { type NavItem } from "@/components/bottom-nav";
import { Icon } from "@/components/icons";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, userId } = await getAuth();
  // Load the profile and the unread count at the same time instead of one after the other.
  const [{ t, isManager }, { count: unread }] = await Promise.all([
    getSession(),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null),
  ]);

  const items: NavItem[] = isManager
    ? [
        { href: "/", label: t.home, icon: "home" },
        { href: "/schedule", label: t.schedule, icon: "calendar" },
        { href: "/events", label: t.events, icon: "star" },
        { href: "/invoices", label: t.invoices, icon: "receipt" },
        { href: "/menu", label: t.menu, icon: "cup" },
        { href: "/more", label: t.more, icon: "menu" },
      ]
    : [
        { href: "/", label: t.home, icon: "home" },
        { href: "/schedule", label: t.schedule, icon: "calendar" },
        { href: "/events", label: t.events, icon: "star" },
        { href: "/swaps", label: t.swaps, icon: "swap" },
        { href: "/more", label: t.more, icon: "menu" },
      ];

  return (
    <div className="pb-24">
      <header className="sticky top-0 z-20 border-b border-bean-100 bg-bean-50/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-bold text-bean-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" className="h-7 w-7" />
            {t.appName}
          </Link>
          <Link href="/notifications" className="relative p-2 text-bean-700" aria-label={t.notifications}>
            <Icon name="bell" className="h-6 w-6" />
            {!!unread && (
              <span className="absolute end-0 top-0 min-w-5 rounded-full bg-red-600 px-1 text-center text-[11px] leading-5 text-white">
                {unread}
              </span>
            )}
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-4">{children}</main>
      <BottomNav items={items} />
    </div>
  );
}
