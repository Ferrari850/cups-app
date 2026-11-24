"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";

export type NavItem = { href: string; label: string; icon: IconName; badge?: number };

/** Floating pill menu at the bottom of the screen; the open page is highlighted in purple. */
export default function BottomNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 px-[max(0.75rem,env(safe-area-inset-left))] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <ul className="mx-auto flex max-w-xl gap-0.5 rounded-[28px] bg-surface/95 p-1.5 shadow-float ring-1 ring-bean-100 backdrop-blur-xl">
        {items.map((it) => {
          const active = it.href === "/" ? path === "/" : path.startsWith(it.href);
          return (
            <li key={it.href} className="min-w-0 flex-1">
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-col items-center gap-0.5 rounded-[22px] px-0.5 py-2 text-[clamp(9px,2.7vw,11px)] tracking-tight font-semibold transition ${
                  active ? "bg-accent-soft text-accent-ink" : "text-bean-500 hover:text-bean-800"
                }`}
              >
                <Icon name={it.icon} className="h-[22px] w-[22px]" />
                <span className="w-full truncate text-center">{it.label}</span>
                {!!it.badge && (
                  <span className="absolute top-1 ms-6 min-w-4 rounded-full bg-amber-700 px-1 text-[10px] leading-4 text-white">
                    {it.badge}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
