/**
 * MOCK USC directory. In the real app this is USC single sign-on: the school and major come from
 * the university's records, never from what the student types. Everyone here is fictional.
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

// Any other usc.edu address still "exists": it gets a stable record picked from its letters.
const PROGRAMS: [SchoolId, string][] = [
  ["viterbi", "Computer Science"], ["marshall", "Business Administration"], ["dornsife", "Economics"], ["annenberg", "Communication"],
  ["sca", "Cinema & Media Studies"], ["thornton", "Music Industry"], ["price", "Public Policy"], ["iovine", "Arts, Technology and the Business of Innovation"],
];
const YEARS = ["Freshman", "Sophomore", "Junior", "Senior"];

/** Only usc.edu addresses can sign in. */
export function isUscEmail(raw: string) {
  return /^[a-z0-9._-]+@usc\.edu$/.test(raw.trim().toLowerCase());
}

/** Look someone up by email; null when the address is not a usc.edu one. */
export function directoryLookup(raw: string): DirectoryEntry | null {
  const email = raw.trim().toLowerCase();
  if (!isUscEmail(email)) return null;
  const known = KNOWN[email];
  if (known) return { email, ...known };
  const local = email.split("@")[0];
  let h = 0;
  for (const ch of local) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [school, major] = PROGRAMS[h % PROGRAMS.length];
  const words = local.replace(/[._\-\d]+/g, " ").trim().split(/\s+/).filter(Boolean);
  const name = words.length ? words.map((w) => w[0].toUpperCase() + w.slice(1)).join(" ") : "Trojan";
  return { email, name, school, major, year: YEARS[h % YEARS.length] };
}

export const initialsOf = (name: string) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
