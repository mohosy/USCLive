/**
 * Who may sign in with Google: only accounts from the school's Google Workspace.
 * No imports, so the rule can be checked on its own (scripts/check-signin.mjs).
 */

/** The only domain Google sign-in accepts. usc.edu unless GOOGLE_ALLOWED_DOMAIN names another; it can never be empty. */
export function allowedDomain(env: string | undefined) {
  return (env ?? "").trim().toLowerCase().replace(/^@/, "") || "usc.edu";
}

export type ClaimsCheck = { ok: true; email: string } | { ok: false; error: string };

/**
 * Check the claims in a Google ID token.
 * - `hd` (the Workspace domain Google itself vouches for) must equal the allowed domain. A personal Google account has
 *   no `hd`, whatever its email address says, so the email's ending alone is never enough.
 * - the email must be at that domain too, and Google must have verified it.
 */
export function checkGoogleClaims(claims: unknown, domain: string): ClaimsCheck {
  const c = (claims && typeof claims === "object" ? claims : {}) as Record<string, unknown>;
  const email = typeof c.email === "string" ? c.email.trim().toLowerCase() : "";
  const hd = typeof c.hd === "string" ? c.hd.trim().toLowerCase() : "";
  const want = domain.trim().toLowerCase();
  if (!want) return { ok: false, error: "Google sign-in is not set up for a school domain." };
  if (hd !== want || !email.endsWith(`@${want}`) || email.indexOf("@") !== email.lastIndexOf("@")) return { ok: false, error: `Use your @${want} Google account.` };
  if (c.email_verified !== true) return { ok: false, error: "Your Google email isn't verified." };
  return { ok: true, email };
}
