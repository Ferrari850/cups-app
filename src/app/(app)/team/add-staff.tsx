"use client";

import { useActionState, useState } from "react";
import type { Dict } from "@/lib/i18n";
import { addStaff } from "./actions";

export default function AddStaff({ t, isOwner }: { t: Dict; isOwner: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(addStaff, undefined);
  if (!open)
    return (
      <button className="btn-primary w-full" onClick={() => setOpen(true)}>
        + {t.addStaff}
      </button>
    );
  return (
    <form action={action} className="card space-y-3">
      <h2 className="h2">{t.addStaff}</h2>
      <input name="full_name" placeholder={t.name} required className="input" />
      <input name="email" type="email" placeholder={t.email} required className="input" dir="ltr" />
      <div className="grid grid-cols-2 gap-2">
        <input name="position" placeholder={t.position} className="input" />
        <input name="phone" type="tel" placeholder={t.phone} className="input" dir="ltr" />
      </div>
      {isOwner && (
        <select name="role" className="input" defaultValue="staff">
          <option value="staff">{t.role_staff}</option>
          <option value="manager">{t.role_manager}</option>
        </select>
      )}
      {state?.ok && (
        <div className="rounded-xl bg-green-50 p-3 text-sm text-green-900">
          <p className="font-semibold">{t.staffAdded}</p>
          <p className="num mt-1">
            {state.email} · {t.tempPassword}: <b>{state.password}</b>
          </p>
          <p className="mt-1">{t.tempPasswordHint}</p>
        </div>
      )}
      {state && !state.ok && <p className="text-sm text-red-700">{state.error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary flex-1" disabled={pending}>{pending ? t.saving : t.add}</button>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>{t.close}</button>
      </div>
    </form>
  );
}
