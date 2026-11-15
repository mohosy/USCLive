/** @usernames: shared by sign-up, Settings and the server (which has the final say on whether one is taken). */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
const RESERVED = new Set(["admin", "usc", "usclive", "support", "help", "dps", "official", "trojans", "me", "settings", "profile"]);

/** "@Tommy.Trojan " -> "tommy.trojan" */
export const normalizeUsername = (raw: string) => raw.trim().replace(/^@+/, "").toLowerCase();

/** Why this username can't be used, or null if it's fine. */
export function usernameProblem(u: string): string | null {
  if (u.length < USERNAME_MIN) return `At least ${USERNAME_MIN} characters`;
  if (u.length > USERNAME_MAX) return `At most ${USERNAME_MAX} characters`;
  if (!/^[a-z0-9._]+$/.test(u)) return "Letters, numbers, periods and underscores only";
  if (/^[._]|[._]$/.test(u)) return "Can't start or end with a period or underscore";
  if (/\.\./.test(u)) return "No two periods in a row";
  if (RESERVED.has(u)) return "That username is reserved";
  return null;
}

/** A starting suggestion from someone's name: "Tommy Trojan" -> "tommytrojan". */
export function suggestUsername(first: string, last = "") {
  const clean = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${clean(first)}${clean(last)}`.slice(0, USERNAME_MAX);
}
