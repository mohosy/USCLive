import { z } from "zod";
import { applyProfile, ProfileInput } from "@/lib/account";
import { createdAccount, rememberAccount } from "@/lib/accounts";
import { SCHOOLS } from "@/lib/campus";
import { directoryLookup, initialsOf, INTERESTS, isUscEmail } from "@/lib/directory";
import { seedUsers } from "@/lib/seed";
import { body } from "@/lib/http";
import { getSession } from "@/lib/google";
import { getMe, getUser, setFriends, uniqueUsername, usernameFree } from "@/lib/store";
import type { SchoolId } from "@/lib/types";
import { normalizeUsername, suggestUsername, usernameProblem } from "@/lib/username";

const Input = z.object({
  action: z.enum(["lookup", "signin"]),
  /** signed in with Google: the email must be the one Google verified for this server's Google session */
  google: z.boolean().optional(),
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
  /** @username: required for a new account; demo students default to their email name */
  username: z.string().max(40).optional(),
  /** friends added in the app, re-applied after the demo server restarts */
  friendIds: z.array(z.string().max(40)).max(500).optional(),
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
  const viaGoogle = !!b.data.google && getSession()?.email === b.data.email.trim().toLowerCase();
  if (!viaGoogle && !isUscEmail(b.data.email)) return Response.json({ error: "Use your @usc.edu email." }, { status: 403 });
  const entry = directoryLookup(b.data.email);
  const existing = entry ? null : createdAccount(b.data.email);
  if (b.data.action === "lookup") return Response.json({ profile: entry, isNew: !entry && !existing });

  const me = getMe();
  const wanted = b.data.username !== undefined ? normalizeUsername(b.data.username) : undefined;
  if (wanted !== undefined) {
    const problem = usernameProblem(wanted);
    if (problem) return Response.json({ error: `Username: ${problem.toLowerCase()}.` }, { status: 400 });
    if (!usernameFree(wanted, me.id)) return Response.json({ error: `@${wanted} is taken. Try another username.` }, { status: 409 });
  } else if (!entry && !existing?.username) {
    return Response.json({ error: "Pick a username." }, { status: 400 });
  }
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
  // a returning account that sent no username keeps the one it had
  const kept = entry ? undefined : createdAccount(b.data.email)?.username;
  me.username = wanted ?? uniqueUsername(kept ?? suggestUsername(b.data.email.split("@")[0]), me.id);
  if (!entry) { const account = createdAccount(b.data.email); if (account) account.username = me.username; }
  // friends: what the browser saved (after adds/removes), else the defaults above; always both ways
  if (b.data.friendIds) {
    for (const id of [...me.friends]) { const u = getUser(id); if (u) setFriends(me, u, false); }
    for (const id of b.data.friendIds) { const u = getUser(id); if (u && u.id !== me.id) setFriends(me, u, true); }
  } else {
    for (const id of me.friends) { const u = getUser(id); if (u) setFriends(me, u, true); }
  }
  return Response.json({ ok: true, username: me.username, friendIds: me.friends });
}
