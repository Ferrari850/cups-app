import Link from "next/link";
import { getAuth, getSession } from "@/lib/session";
import BottomNav, { type NavItem } from "@/components/bottom-nav";
import { Icon } from "@/components/icons";
import { ThemeButton } from "@/components/theme";
import Clock from "@/components/clock";

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
        { href: "/pos", label: t.till, icon: "cart" },
        { href: "/invoices", label: t.invoices, icon: "receipt" },
        { href: "/menu", label: t.navCosts, icon: "cup" },
        { href: "/more", label: t.more, icon: "menu" },
      ]
    : [
        { href: "/", label: t.home, icon: "home" },
        { href: "/schedule", label: t.schedule, icon: "calendar" },
        { href: "/events", label: t.events, icon: "star" },
        { href: "/pos", label: t.till, icon: "cart" },
        { href: "/more", label: t.more, icon: "menu" },
      ];

  return (
    <div className="pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:pb-10">
      <header className="sticky top-0 z-20 bg-page/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-safe py-3">
          <Link href="/" className="flex items-center gap-2.5 text-lg font-extrabold tracking-tight text-bean-900">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" className="h-9 w-9 rounded-xl bg-surface p-1 shadow-card" />
            {t.appName}
          </Link>
          <div className="flex items-center gap-2">
            <Clock className="me-2 hidden text-3xl font-extrabold tracking-tight text-bean-900 md:inline" />
            <ThemeButton label={t.switchTheme} />
            <Link href="/notifications" className="icon-btn relative" aria-label={t.notifications}>
              <Icon name="bell" className="h-5 w-5" />
              {!!unread && (
                <span className="absolute -end-1 -top-1 min-w-5 rounded-full bg-amber-700 px-1 text-center text-[11px] leading-5 font-bold text-white ring-2 ring-page">
                  {unread}
                </span>
              )}
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-safe py-3">{children}</main>
      <BottomNav items={items} />
    </div>
  );
}
