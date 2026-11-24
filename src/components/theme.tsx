"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icons";

export type ThemeChoice = "system" | "light" | "dark";

/** Saves the choice on this device (cookie, so the server paints the right colors on first load). */
function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") {
    root.removeAttribute("data-theme");
    document.cookie = "theme=; path=/; max-age=0";
  } else {
    root.setAttribute("data-theme", choice);
    document.cookie = `theme=${choice}; path=/; max-age=${60 * 60 * 24 * 365}`;
  }
  window.dispatchEvent(new Event("themechange"));
}

function currentChoice(): ThemeChoice {
  const v = document.documentElement.getAttribute("data-theme");
  return v === "light" || v === "dark" ? v : "system";
}

function isDarkNow() {
  const c = currentChoice();
  return c === "dark" || (c === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
}

function useThemeState() {
  const [state, setState] = useState<{ choice: ThemeChoice; dark: boolean } | null>(null);
  useEffect(() => {
    const update = () => setState({ choice: currentChoice(), dark: isDarkNow() });
    update();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", update);
    window.addEventListener("themechange", update);
    return () => {
      mq.removeEventListener("change", update);
      window.removeEventListener("themechange", update);
    };
  }, []);
  return state;
}

/** Round sun / moon button in the header: flips between light and dark. */
export function ThemeButton({ label }: { label: string }) {
  const s = useThemeState();
  return (
    <button type="button" className="icon-btn" aria-label={label} title={label} onClick={() => applyTheme(isDarkNow() ? "light" : "dark")}>
      <Icon name={s?.dark ? "moon" : "sun"} className="h-5 w-5" />
    </button>
  );
}

/** Auto | Light | Dark picker for the More page. */
export function ThemePicker({ labels }: { labels: Record<ThemeChoice, string> }) {
  const s = useThemeState();
  const opts: ThemeChoice[] = ["system", "light", "dark"];
  return (
    <div className="seg" role="radiogroup">
      {opts.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={s?.choice === o}
          onClick={() => applyTheme(o)}
          className={`seg-item flex-1 ${s?.choice === o ? "seg-on" : ""}`}
        >
          {labels[o]}
        </button>
      ))}
    </div>
  );
}
