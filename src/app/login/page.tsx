import { getLocale } from "@/lib/session";
import { getDict } from "@/lib/i18n";
import LoginForm from "./login-form";
import LangToggle from "@/components/lang-toggle";

export default async function LoginPage() {
  const locale = await getLocale();
  const t = getDict(locale);
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <div className="mb-8 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" className="mx-auto mb-3 h-16 w-16" />
        <h1 className="h1">{t.appName}</h1>
      </div>
      <LoginForm t={t} />
      <div className="mt-8 text-center">
        <LangToggle locale={locale} label={t.switchLang} />
      </div>
    </main>
  );
}
