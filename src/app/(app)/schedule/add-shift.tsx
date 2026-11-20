"use client";

import { useActionState, useEffect, useState } from "react";
import type { Dict } from "@/lib/i18n";
import { fmtDay, type Locale } from "@/lib/format";
import { addShift } from "./actions";

export default function AddShift({
  t,
  staff,
  days,
  locale,
}: {
  t: Dict;
  staff: { id: string; full_name: string }[];
  days: string[];
  locale: Locale;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(addShift, undefined);
  const [formKey, setFormKey] = useState(0);
  useEffect(() => {
    if (state?.ok) setFormKey((k) => k + 1);
  }, [state]);

  if (!open)
    return (
      <button className="btn-primary flex-1" onClick={() => setOpen(true)}>
        + {t.addShift}
      </button>
    );

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 sm:items-center" onClick={() => setOpen(false)}>
      <form
        key={formKey}
        action={action}
        className="max-h-[90dvh] w-full max-w-md space-y-3 overflow-y-auto rounded-t-3xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="h2">{t.addShift}</h2>
        <div>
          <label className="label">{t.staffMember}</label>
          <div className="grid max-h-44 grid-cols-2 gap-1 overflow-y-auto rounded-xl border border-bean-200 p-2">
            {staff.map((s) => (
              <label key={s.id} className="flex items-center gap-2 rounded-lg p-1.5 text-sm has-[:checked]:bg-bean-100">
                <input type="checkbox" name="staff_id" value={s.id} className="h-4 w-4 accent-bean-700" />
                <span className="truncate">{s.full_name}</span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="label">{t.date}</label>
          <select name="date" className="input" required>
            {days.map((d) => (
              <option key={d} value={d}>{fmtDay(d + "T12:00:00Z", locale)}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">{t.start}</label>
            <input type="time" name="start" defaultValue="07:00" required className="input num" />
          </div>
          <div>
            <label className="label">{t.end}</label>
            <input type="time" name="end" defaultValue="15:00" required className="input num" />
          </div>
        </div>
        <div>
          <label className="label">{t.station} <span className="muted">({t.optional})</span></label>
          <input name="station" placeholder={t.stationHint} className="input" />
        </div>
        <div>
          <label className="label">{t.notes} <span className="muted">({t.optional})</span></label>
          <input name="notes" className="input" />
        </div>
        {state?.ok && <p className="text-sm text-green-700">✓</p>}
        {state && !state.ok && <p className="text-sm text-red-700">{state.error === "staff" ? t.staffMember : state.error}</p>}
        <div className="flex gap-2">
          <button className="btn-primary flex-1" disabled={pending}>{pending ? t.saving : t.add}</button>
          <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>{t.close}</button>
        </div>
      </form>
    </div>
  );
}
