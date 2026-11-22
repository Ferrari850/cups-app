"use client";

import { useActionState } from "react";
import { signIn } from "@/lib/actions";
import type { Dict } from "@/lib/i18n";

export default function LoginForm({ t }: { t: Dict }) {
  const [state, action, pending] = useActionState(signIn, undefined);
  return (
    <form action={action} className="card space-y-4">
      <div>
        <label className="label" htmlFor="email">{t.loginId}</label>
        <input id="email" name="email" type="text" autoComplete="username" autoCapitalize="none" required className="input" dir="ltr" />
      </div>
      <div>
        <label className="label" htmlFor="password">{t.password}</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" dir="ltr" />
      </div>
      {state?.error && <p className="text-sm text-red-700">{t.wrongLogin}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "…" : t.signIn}</button>
    </form>
  );
}
