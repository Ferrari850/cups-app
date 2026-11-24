import { getSession } from "@/lib/session";
import Board from "./board";

export default async function BarPage() {
  const { t, locale } = await getSession();
  return <Board t={t} locale={locale} />;
}
