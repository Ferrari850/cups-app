"use client";

import { useActionState } from "react";
import type { Dict } from "@/lib/i18n";
import { createEvent, updateEvent } from "./actions";

export type EventValues = {
  id?: string;
  title?: string;
  description?: string | null;
  location?: string | null;
  date?: string;
  start?: string;
  end?: string;
  guests?: number | null;
  staff?: Record<string, string | null>; // staff_id -> duty
};

export default function EventForm({
  t,
  people,
  values = {},
}: {
  t: Dict;
  people: { id: string; full_name: string; position: string | null }[];
  values?: EventValues;
}) {
  const [state, action, pending] = useActionState(values.id ? updateEvent : createEvent, undefined);
  return (
    <form action={action} className="space-y-4">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <div className="card space-y-3">
        <div>
          <label className="label">{t.eventTitle}</label>
          <input name="title" defaultValue={values.title} required className="input" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="col-span-2 sm:col-span-1">
            <label className="label">{t.date}</label>
            <input type="date" name="date" defaultValue={values.date} required className="input num" />
          </div>
          <div>
            <label className="label">{t.start}</label>
            <input type="time" name="start" defaultValue={values.start ?? "18:00"} required className="input num" />
          </div>
          <div>
            <label className="label">{t.end}</label>
            <input type="time" name="end" defaultValue={values.end} className="input num" />
          </div>
          <div className="col-span-2 sm:col-span-3">
            <label className="label">{t.guests}</label>
            <input type="number" name="guests" min={0} defaultValue={values.guests ?? ""} className="input num" />
          </div>
        </div>
        <div>
          <label className="label">{t.location}</label>
          <input name="location" defaultValue={values.location ?? ""} className="input" />
        </div>
        <div>
          <label className="label">{t.description}</label>
          <textarea name="description" rows={3} defaultValue={values.description ?? ""} className="input py-2" />
        </div>
      </div>

      <div className="card">
        <h2 className="h2 mb-2">{t.assignedStaff}</h2>
        <ul className="divide-y divide-bean-100">
          {people.map((p) => {
            const on = values.staff ? p.id in values.staff : false;
            return (
              <li key={p.id} className="flex items-center gap-3 py-2">
                <label className="flex flex-1 items-center gap-2">
                  <input type="checkbox" name="staff_id" value={p.id} defaultChecked={on} className="peer h-5 w-5 accent-bean-700" />
                  <span>{p.full_name}</span>
                  {p.position && <span className="muted">· {p.position}</span>}
                </label>
                <input
                  name={`duty_${p.id}`}
                  defaultValue={values.staff?.[p.id] ?? ""}
                  placeholder={t.dutyHint}
                  className="input min-h-9 w-36 text-sm"
                />
              </li>
            );
          })}
        </ul>
      </div>
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? t.saving : t.save}</button>
    </form>
  );
}
