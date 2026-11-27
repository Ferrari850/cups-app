import { getSession } from "@/lib/session";
import StationBoard from "../station-board";

/** Kitchen screen: food items only. */
export default async function KitchenPage() {
  const { t, locale } = await getSession();
  return <StationBoard station="kitchen" t={t} locale={locale} />;
}
