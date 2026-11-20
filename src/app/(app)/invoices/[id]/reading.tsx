"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function Poller() {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}

export function RetryButton({ id, label, subtle }: { id: string; label: string; subtle?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className={subtle ? "text-sm text-bean-600 underline" : "btn-primary"}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch(`/api/invoices/${id}/read`, { method: "POST" });
        setBusy(false);
        router.refresh();
      }}
    >
      {busy ? "…" : label}
    </button>
  );
}
