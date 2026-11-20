/**
 * Staff can sign in with a short ID (e.g. "1001") instead of an email.
 * Supabase needs an email, so an ID is stored as "<id>@cups.local" (no mail is ever sent there).
 */
export const ID_DOMAIN = "cups.local";

/** Turn Arabic-Indic (٠-٩) and Persian (۰-۹) digits into 0-9, so an Arabic keyboard works too. */
export function normalizeDigits(input: string) {
  return input
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

export function toLoginEmail(input: string) {
  const v = normalizeDigits(input).replace(/\s+/g, "").toLowerCase();
  return v.includes("@") ? v : `${v}@${ID_DOMAIN}`;
}

/** What to show for a login: the ID for ID logins, otherwise the email. */
export function displayLogin(email: string | null | undefined) {
  if (!email) return "";
  return email.endsWith(`@${ID_DOMAIN}`) ? email.slice(0, -ID_DOMAIN.length - 1) : email;
}
