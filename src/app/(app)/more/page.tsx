import Link from "next/link";
import { getSession } from "@/lib/session";
import { signOut } from "@/lib/actions";
import { Icon, type IconName } from "@/components/icons";
import LangToggle from "@/components/lang-toggle";
import { ThemePicker } from "@/components/theme";

export default async function MorePage() {
  const { t, locale, isManager, profile } = await getSession();
  const links: { href: string; label: string; icon: IconName; show: boolean }[] = [
    { href: "/pos", label: t.till, icon: "cart", show: true },
    { href: "/bar", label: t.barDisplay, icon: "cup", show: true },
    { href: "/orders", label: t.orders, icon: "receipt", show: true },
    { href: "/drawer", label: t.drawer, icon: "cash", show: true },
    { href: "/reports", label: t.reports, icon: "chart", show: isManager },
    { href: "/stock", label: t.stock, icon: "box", show: isManager },
    { href: "/prices", label: t.priceList, icon: "tag", show: isManager },
    { href: "/channels", label: t.channels, icon: "swap", show: isManager },
    { href: "/addons", label: t.addons, icon: "plus", show: isManager },
    { href: "/settings", label: t.posSettings, icon: "gear", show: isManager },
    { href: "/events", label: t.events, icon: "star", show: isManager },
    { href: "/swaps", label: t.swaps, icon: "swap", show: true },
    { href: "/notifications", label: t.notifications, icon: "bell", show: true },
    { href: "/items", label: t.items, icon: "box", show: isManager },
    { href: "/alerts", label: t.alerts, icon: "alert", show: isManager },
    { href: "/team", label: t.team, icon: "users", show: isManager },
    { href: "/profile", label: t.profile, icon: "user", show: true },
  ];
  return (
    <>
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent text-xl font-bold text-white">
          {profile.full_name.trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h1 className="h1 truncate">{profile.full_name}</h1>
          <p className="muted">{t[`role_${profile.role}`]}</p>
        </div>
      </div>
      <ul className="card divide-y divide-bean-100 px-2 py-1">
        {links
          .filter((l) => l.show)
          .map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="flex items-center gap-3 px-2 py-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-bean-50 text-bean-700">
                  <Icon name={l.icon} className="h-5 w-5" />
                </span>
                <span className="flex-1 font-medium">{l.label}</span>
                <Icon name="chevron" className="h-4 w-4 text-bean-300 rtl:rotate-180" />
              </Link>
            </li>
          ))}
      </ul>
      <h2 className="eyebrow mt-6 mb-2.5 px-1">{t.appearance}</h2>
      <ThemePicker labels={{ system: t.themeSystem, light: t.themeLight, dark: t.themeDark }} />
      <div className="mt-6 flex gap-2">
        <LangToggle locale={locale} label={t.switchLang} className="btn-secondary flex-1" />
        <form action={signOut} className="flex-1">
          <button className="btn-danger w-full">{t.signOut}</button>
        </form>
      </div>
    </>
  );
}
