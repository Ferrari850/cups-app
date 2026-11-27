import { getSession } from "@/lib/session";
import StationBoard from "../station-board";

/** Bar screen: open this on both bar displays; they stay in step. */
export default async function BarPage() {
  const { t, locale } = await getSession();
  return <StationBoard station="bar" t={t} locale={locale} />;
}
