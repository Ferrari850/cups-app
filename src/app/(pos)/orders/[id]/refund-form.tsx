"use client";

import { useActionState, useState } from "react";
import type { Dict } from "@/lib/i18n";
import { refundOrder } from "../actions";

export default function RefundForm({ id, t, isManager }: { id: string; t: Dict; isManager: boolean }) {
  const [state, action, pending] = useActionState(refundOrder, undefined);
  // Controlled, so a wrong PIN does not wipe the reason (forms reset after each submit).
  const [reason, setReason] = useState("");
  const [restock, setRestock] = useState(false);
  return (
    <details className="card">
      <summary className="cursor-pointer font-semibold text-red-700">{t.refund}</summary>
      <form action={action} className="mt-3 space-y-2">
        <input type="hidden" name="id" value={id} />
        <input name="reason" required value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t.refundReason} className="input" />
        {!isManager && (
          <input name="pin" required inputMode="numeric" type="password" autoComplete="off" placeholder={t.managerPin} className="input num" />
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="restock" checked={restock} onChange={(e) => setRestock(e.target.checked)} /> {t.restockHint}
        </label>
        {state?.error && <p className="text-sm text-red-700">{state.error === "pin" ? t.wrongPin : state.error}</p>}
        <button className="btn-danger w-full" disabled={pending} onClick={(e) => { if (!confirm(t.areYouSure)) e.preventDefault(); }}>
          {pending ? t.saving : t.refundFull}
        </button>
      </form>
    </details>
  );
}
