export const TZ = "Asia/Dubai";
/** Dubai is UTC+4 all year (no daylight saving). */
export const TZ_OFFSET = "+04:00";

export type Locale = "en" | "ar";

const tag = (l: Locale) => (l === "ar" ? "ar-AE-u-nu-latn" : "en-GB");

export function fmtDate(d: string | Date, l: Locale, opts: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat(tag(l), { timeZone: TZ, day: "numeric", month: "short", ...opts }).format(
    new Date(d),
  );
}

export function fmtDay(d: string | Date, l: Locale) {
  return new Intl.DateTimeFormat(tag(l), { timeZone: TZ, weekday: "long", day: "numeric", month: "short" }).format(
    new Date(d),
  );
}

export function fmtTime(d: string | Date, l: Locale) {
  return new Intl.DateTimeFormat(tag(l), { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(
    new Date(d),
  );
}

export function fmtAED(n: number | string | null | undefined, l: Locale, digits = 2) {
  if (n === null || n === undefined || n === "") return "–";
  const v = typeof n === "string" ? parseFloat(n) : n;
  return new Intl.NumberFormat(tag(l), {
    style: "currency",
    currency: "AED",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(v);
}

export function fmtNum(n: number | string | null | undefined, l: Locale, digits = 2) {
  if (n === null || n === undefined || n === "") return "–";
  const v = typeof n === "string" ? parseFloat(n) : n;
  return new Intl.NumberFormat(tag(l), { maximumFractionDigits: digits }).format(v);
}

/** Calendar date (YYYY-MM-DD) in Dubai for a given instant. */
export function dubaiDate(d: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

/** First day of the schedule week. */
export const WEEK_STARTS_ON = 1; // 0 = Sunday, 1 = Monday, 6 = Saturday

export function weekStart(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00Z");
  const diff = (d.getUTCDay() - WEEK_STARTS_ON + 7) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

export function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "2026-11-23" + "07:30" -> ISO instant in Dubai time. */
export function dubaiInstant(date: string, time: string) {
  return new Date(`${date}T${time}:00${TZ_OFFSET}`).toISOString();
}

export function hoursBetween(a: string, b: string) {
  return (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000;
}
