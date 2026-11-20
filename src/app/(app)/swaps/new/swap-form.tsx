"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { Dict } from "@/lib/i18n";
import { fmtDay, fmtTime, type Locale } from "@/lib/format";
import { requestSwap } from "../actions";

type S = { id: string; staff_id: string; starts_at: string; ends_at: string };

export default function SwapForm({
  t,
  locale,
  shift,
  people,
  theirShifts,
}: {
  t: Dict;
  locale: Locale;
  shift: S & { station: string | null };
  people: { id: string; full_name: string }[];
  theirShifts: S[];
}) {
  const [target, setTarget] = useState("");
  const [state, action, pending] = useActionState(requestSwap, undefined);
  const label = (s: S) => `${fmtDay(s.starts_at, locale)} ${fmtTime(s.starts_at, locale)}–${fmtTime(s.ends_at, locale)}`;

  if (state?.ok)
    return (
      <div className="card space-y-3 text-center">
        <p>✅ {t.swapSent}</p>
        <Link href="/swaps" className="btn-primary">{t.swaps}</Link>
      </div>
    );

  return (
    <form action={action} className="card space-y-4">
      <input type="hidden" name="shift_id" value={shift.id} />
      <div className="rounded-xl bg-bean-50 p-3 font-semibold num">{label(shift)}</div>
      <div>
        <label className="label">{t.swapWith}</label>
        <select name="target_id" required className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="" disabled>—</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.full_name}</option>
          ))}
        </select>
      </div>
      {target && (
        <div>
          <label className="label">{t.tradeFor}</label>
          <select name="target_shift_id" className="input" defaultValue="">
            <option value="">{t.noTrade}</option>
            {theirShifts
              .filter((s) => s.staff_id === target)
              .map((s) => (
                <option key={s.id} value={s.id}>{label(s)}</option>
              ))}
          </select>
        </div>
      )}
      <div>
        <label className="label">{t.message} <span className="muted">({t.optional})</span></label>
        <textarea name="message" rows={2} className="input py-2" />
      </div>
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? t.saving : t.sendRequest}</button>
    </form>
  );
}
