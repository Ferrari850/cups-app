import Link from "next/link";
import { getSession } from "@/lib/session";
import { Icon } from "@/components/icons";
import { ThemeButton } from "@/components/theme";
import LangToggle from "@/components/lang-toggle";
import Clock from "@/components/clock";
import PosTabs from "./pos-tabs";

/** Full-width layout for the counter tablets: till, bar display and receipts. */
export default async function PosLayout({ children }: { children: React.ReactNode }) {
  const { t, locale } = await getSession();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 bg-page/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl print:hidden">
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <Link href="/" className="icon-btn shrink-0" aria-label={t.home}>
              <Icon name="home" className="h-5 w-5" />
            </Link>
            <PosTabs labels={{ pos: t.till, bar: t.barDisplay, orders: t.orders, drawer: t.drawer }} />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Clock className="me-1 hidden text-xl font-extrabold tracking-tight text-bean-900 sm:inline" />
            <LangToggle locale={locale} label={locale === "ar" ? "EN" : "ع"} className="icon-btn hidden text-sm font-bold sm:inline-flex" />
            <span className="hidden sm:inline-flex"><ThemeButton label={t.switchTheme} /></span>
          </div>
        </div>
      </header>
      <main className="flex-1 px-3 pb-3">{children}</main>
    </div>
  );
}
