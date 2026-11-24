"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function PosTabs({ labels }: { labels: { pos: string; bar: string; orders: string; drawer: string } }) {
  const path = usePathname();
  const tabs = [
    { href: "/pos", label: labels.pos },
    { href: "/bar", label: labels.bar },
    { href: "/orders", label: labels.orders },
    { href: "/drawer", label: labels.drawer },
  ];
  return (
    <nav className="seg min-w-0 overflow-x-auto">
      {tabs.map((tab) => (
        <Link key={tab.href} href={tab.href} className={`seg-item shrink-0 whitespace-nowrap px-3 py-1.5 ${path.startsWith(tab.href) ? "seg-on" : ""}`}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
