"use client";

import { useEffect, useState } from "react";

/** Live Dubai time, like the big clock in a dashboard header. */
export default function Clock({ className = "" }: { className?: string }) {
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    const f = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai" });
    const tick = () => setNow(f.format(new Date()));
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, []);
  return <span className={`num ${className}`}>{now ?? " "}</span>;
}
