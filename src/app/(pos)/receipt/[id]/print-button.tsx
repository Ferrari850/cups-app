"use client";

import { useEffect } from "react";

export default function PrintButton({ label, auto }: { label: string; auto?: boolean }) {
  useEffect(() => {
    if (auto) setTimeout(() => window.print(), 300);
  }, [auto]);
  return (
    <button type="button" className="btn-primary w-full" onClick={() => window.print()}>
      {label}
    </button>
  );
}
