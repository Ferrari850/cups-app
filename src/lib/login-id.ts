/**
 * Staff can sign in with a short ID (e.g. "1001") instead of an email.
 * Supabase needs an email, so an ID is stored as "<id>@cups.local" (no mail is ever sent there).
 */
export const ID_DOMAIN = "cups.local";

export function toLoginEmail(input: string) {
  const v = input.trim().toLowerCase();
  return v.includes("@") ? v : `${v}@${ID_DOMAIN}`;
}

/** What to show for a login: the ID for ID logins, otherwise the email. */
export function displayLogin(email: string | null | undefined) {
  if (!email) return "";
  return email.endsWith(`@${ID_DOMAIN}`) ? email.slice(0, -ID_DOMAIN.length - 1) : email;
}
