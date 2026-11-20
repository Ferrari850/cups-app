import Link from "next/link";
import { getSession } from "@/lib/session";
import { signOut } from "@/lib/actions";
import { Icon, type IconName } from "@/components/icons";
import LangToggle from "@/components/lang-toggle";

export default async function MorePage() {
  const { t, locale, isManager, profile } = await getSession();
  const links: { href: string; label: string; icon: IconName; show: boolean }[] = [
    { href: "/swaps", label: t.swaps, icon: "swap", show: true },
    { href: "/notifications", label: t.notifications, icon: "bell", show: true },
    { href: "/items", label: t.items, icon: "box", show: isManager },
    { href: "/alerts", label: t.alerts, icon: "alert", show: isManager },
    { href: "/team", label: t.team, icon: "users", show: isManager },
    { href: "/profile", label: t.profile, icon: "user", show: true },
  ];
  return (
    <>
      <h1 className="h1 mb-1">{profile.full_name}</h1>
      <p className="muted mb-4">{t[`role_${profile.role}`]}</p>
      <ul className="card divide-y divide-bean-100 p-0">
        {links
          .filter((l) => l.show)
          .map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="flex items-center gap-3 px-4 py-3.5">
                <Icon name={l.icon} className="h-5 w-5 text-bean-600" />
                <span className="flex-1">{l.label}</span>
                <Icon name="chevron" className="h-4 w-4 text-bean-300 rtl:rotate-180" />
              </Link>
            </li>
          ))}
      </ul>
      <div className="mt-6 flex gap-2">
        <LangToggle locale={locale} label={t.switchLang} className="btn-secondary flex-1" />
        <form action={signOut} className="flex-1">
          <button className="btn-danger w-full">{t.signOut}</button>
        </form>
      </div>
    </>
  );
}
