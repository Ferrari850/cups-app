"use client";

import { useActionState } from "react";
import type { Dict } from "@/lib/i18n";
import { changePassword, updateProfile } from "./actions";

export default function ProfileForms({ t, name, phone }: { t: Dict; name: string; phone: string }) {
  const [p, saveProfile, savingProfile] = useActionState(updateProfile, undefined);
  const [pw, savePw, savingPw] = useActionState(changePassword, undefined);
  return (
    <div className="space-y-4">
      <form action={saveProfile} className="card space-y-3">
        <div>
          <label className="label">{t.name}</label>
          <input name="full_name" defaultValue={name} required className="input" />
        </div>
        <div>
          <label className="label">{t.phone}</label>
          <input name="phone" defaultValue={phone} type="tel" className="input" dir="ltr" />
        </div>
        {p?.error && <p className="text-sm text-red-700">{p.error}</p>}
        <button className="btn-primary" disabled={savingProfile}>{p?.ok ? "✓ " : ""}{t.save}</button>
      </form>
      <form action={savePw} className="card space-y-3">
        <div>
          <label className="label">{t.newPassword}</label>
          <input name="password" type="password" minLength={6} required autoComplete="new-password" className="input" dir="ltr" />
        </div>
        {pw?.error && <p className="text-sm text-red-700">{pw.error}</p>}
        {pw?.ok && <p className="text-sm text-green-700">{t.passwordChanged}</p>}
        <button className="btn-secondary" disabled={savingPw}>{t.changePassword}</button>
      </form>
    </div>
  );
}
