/**
 * MOCK USC directory with a few fictional demo students. In the real app this is USC single sign-on.
 * Anyone else creates an account with their own name and school: nothing is made up for them.
 */
import type { SchoolId } from "./types";

export interface DirectoryEntry { email: string; name: string; school: SchoolId; major: string; year: string }

export const INTERESTS = ["basketball", "soccer", "music", "film", "startups", "finance", "AI", "study groups", "free food", "running"];

const KNOWN: Record<string, Omit<DirectoryEntry, "email">> = {
  "ttrojan@usc.edu": { name: "Tommy Trojan", school: "marshall", major: "Business Administration", year: "Junior" },
  "arivera@usc.edu": { name: "Alex Rivera", school: "viterbi", major: "Computer Science (Business minor)", year: "Junior" },
  "pshah@usc.edu": { name: "Priya Shah", school: "marshall", major: "Business Administration", year: "Junior" },
  "mchen@usc.edu": { name: "Maya Chen", school: "sca", major: "Film & TV Production", year: "Senior" },
  "smartinez@usc.edu": { name: "Sofia Martinez", school: "annenberg", major: "Journalism", year: "Sophomore" },
};

/** Only usc.edu addresses can sign in. */
export function isUscEmail(raw: string) {
  return /^[a-z0-9._-]+@usc\.edu$/.test(raw.trim().toLowerCase());
}

/** The demo directory record for this address, or null (a real student creates their account instead). */
export function directoryLookup(raw: string): DirectoryEntry | null {
  const email = raw.trim().toLowerCase();
  const known = isUscEmail(email) ? KNOWN[email] : undefined;
  return known ? { email, ...known } : null;
}

export const initialsOf = (name: string) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
