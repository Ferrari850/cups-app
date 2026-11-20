"use client";

import { useActionState, useState } from "react";
import type { Dict } from "@/lib/i18n";
import type { Profile } from "@/lib/session";
import { resetPassword, setActive, updateMember } from "./actions";

export default function MemberCard({ p, t, isOwner, isMe }: { p: Profile; t: Dict; isOwner: boolean; isMe: boolean }) {
  const [edit, setEdit] = useState(false);
  const [pw, reset, resetting] = useActionState(resetPassword, undefined);
  const canEdit = !isMe && (p.role !== "owner");
  return (
    <li className={`card ${p.active ? "" : "opacity-60"}`}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="font-semibold">{p.full_name}</div>
          <div className="muted">
            {t[`role_${p.role}`]}
            {p.position && ` · ${p.position}`}
            {!p.active && ` · ${t.inactive}`}
          </div>
          {p.phone && <a href={`tel:${p.phone}`} className="num text-sm text-bean-600 underline">{p.phone}</a>}
        </div>
        {canEdit && (
          <button className="btn-secondary btn-sm" onClick={() => setEdit(!edit)}>{t.edit}</button>
        )}
      </div>
      {edit && (
        <div className="mt-3 space-y-3 border-t border-bean-100 pt-3">
          <form action={updateMember} className="space-y-2">
            <input type="hidden" name="id" value={p.id} />
            <div className="grid grid-cols-2 gap-2">
              <input name="position" defaultValue={p.position ?? ""} placeholder={t.position} className="input" />
              <input name="phone" defaultValue={p.phone ?? ""} placeholder={t.phone} className="input" dir="ltr" />
            </div>
            {isOwner && (
              <select name="role" defaultValue={p.role} className="input">
                <option value="staff">{t.role_staff}</option>
                <option value="manager">{t.role_manager}</option>
              </select>
            )}
            <button className="btn-primary btn-sm">{t.save}</button>
          </form>
          <div className="flex flex-wrap gap-2">
            <form action={reset}>
              <input type="hidden" name="id" value={p.id} />
              <button className="btn-secondary btn-sm" disabled={resetting}>{t.tempPassword}</button>
            </form>
            <form action={setActive}>
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="active" value={p.active ? "0" : "1"} />
              <button className="btn-danger btn-sm">{p.active ? t.deactivate : t.reactivate}</button>
            </form>
          </div>
          {pw?.ok && (
            <p className="num rounded-xl bg-green-50 p-2 text-sm">
              {t.tempPassword}: <b>{pw.password}</b>
            </p>
          )}
        </div>
      )}
    </li>
  );
}
