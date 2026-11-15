/**
 * Accounts created at sign-up (anyone who is not one of the demo directory students), remembered by email
 * so the school chosen the first time stays locked: signing out and back in cannot switch schools.
 * In memory only, like the rest of the demo store, so a server restart forgets them.
 * In the real app the school comes from USC single sign-on and is never typed in.
 */
import type { SchoolId } from "./types";

/** `username` is the latest @username, kept so a returning sign-in does not have to re-type it (only name and school are locked). */
export interface CreatedAccount { firstName: string; lastName: string; school: SchoolId; username?: string }

// kept apart from the demo store so a demo reset does not unlock anyone's school
const g = globalThis as unknown as { __uscliveAccounts?: Map<string, CreatedAccount> };
const accounts = () => (g.__uscliveAccounts ??= new Map<string, CreatedAccount>());
const key = (email: string) => email.trim().toLowerCase();

/** The account already created for this email, or null. */
export function createdAccount(email: string): CreatedAccount | null {
  return accounts().get(key(email)) ?? null;
}

/** Remember a new account. If this email already has one, the first record wins and is returned unchanged. */
export function rememberAccount(email: string, account: CreatedAccount): CreatedAccount {
  const existing = accounts().get(key(email));
  if (existing) return existing;
  const saved = { ...account };
  accounts().set(key(email), saved);
  return saved;
}
