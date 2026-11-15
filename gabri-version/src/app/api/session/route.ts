import { z } from "zod";
import { applyProfile, ProfileInput } from "@/lib/account";
import { createdAccount, rememberAccount } from "@/lib/accounts";
import { SCHOOLS } from "@/lib/campus";
import { directoryLookup, initialsOf, INTERESTS, isUscEmail } from "@/lib/directory";
import { seedUsers } from "@/lib/seed";
import { body } from "@/lib/http";
import { getMe } from "@/lib/store";
import type { SchoolId } from "@/lib/types";

const Input = z.object({
  action: z.enum(["lookup", "signin"]),
  // new account: what the student tells us (nothing else is filled in for them)
  signup: z.object({
    firstName: z.string().trim().min(1).max(40),
    lastName: z.string().trim().min(1).max(40),
    school: z.enum(SCHOOLS.filter((x) => x.id !== "all").map((x) => x.id) as [string, ...string[]]),
  }).optional(),
  email: z.string().max(120),
  interests: z.array(z.string().max(40)).max(20).optional(),
  accountType: z.enum(["student", "creator"]).optional(),
  creatorOrgId: z.string().max(40).nullable().optional(),
  // profile edits saved in the browser, re-applied after the demo server restarts
  profile: ProfileInput.pick({ name: true, pronouns: true, bio: true, photo: true }).optional(),
});

/**
 * Mock sign-in. `lookup` says whether a usc.edu address is one of the demo students (directory record) or
 * a new account. `signin` makes the demo user that person: demo students get their directory record and
 * demo schedule; a new account gets only the name and school they entered, and starts with no classes,
 * friends, clubs or interests. The school is locked the first time an email creates its account: later
 * sign-ins reuse it, whatever they send. (In the real app it comes from USC single sign-on.)
 */
export async function POST(req: Request) {
  const b = await body(req, Input);
  if (!b.ok) return b.res;
  if (!isUscEmail(b.data.email)) return Response.json({ error: "Use your @usc.edu email." }, { status: 403 });
  const entry = directoryLookup(b.data.email);
  const existing = entry ? null : createdAccount(b.data.email);
  if (b.data.action === "lookup") return Response.json({ profile: entry, isNew: !entry && !existing });

  const me = getMe();
  const base = { creatorOrgId: undefined, pronouns: undefined, bio: undefined, photo: undefined, accountType: b.data.accountType ?? "student" };
  if (entry) {
    const demo = seedUsers(new Date()).find((u) => u.id === me.id)!; // the demo student's schedule, friends and clubs
    Object.assign(me, {
      ...base, name: entry.name, avatar: initialsOf(entry.name), school: entry.school, major: entry.major, year: entry.year, email: entry.email, verified: true,
      interests: (b.data.interests ?? demo.interests).filter((i) => INTERESTS.includes(i)), classes: demo.classes, friends: demo.friends, orgs: demo.orgs,
    });
  } else {
    if (!existing && !b.data.signup) return Response.json({ error: "Create your account first." }, { status: 400 });
    // an email that already has an account keeps its first name and school; a different school sent now is ignored
    const { firstName, lastName, school } = existing ?? rememberAccount(b.data.email, { ...b.data.signup!, school: b.data.signup!.school as SchoolId });
    const name = `${firstName} ${lastName}`;
    Object.assign(me, {
      ...base, name, avatar: initialsOf(name), school, major: "", year: "", email: b.data.email.trim().toLowerCase(), verified: false,
      interests: (b.data.interests ?? []).filter((i) => INTERESTS.includes(i)), classes: [], friends: [], orgs: [],
    });
  }
  applyProfile(me, { ...(b.data.profile ?? {}), creatorOrgId: b.data.creatorOrgId ?? null });
  return Response.json({ ok: true });
}
