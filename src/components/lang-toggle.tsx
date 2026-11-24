"use client";

import { useTransition } from "react";
import { setLocale } from "@/lib/actions";
import { Icon } from "./icons";
import type { Locale } from "@/lib/format";

export default function LangToggle({ locale, label, className = "btn-secondary" }: { locale: Locale; label: string; className?: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={className}
      disabled={pending}
      onClick={() => start(() => setLocale(locale === "ar" ? "en" : "ar"))}
    >
      <Icon name="globe" className="h-4 w-4" /> {label}
    </button>
  );
}
