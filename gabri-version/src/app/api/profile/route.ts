import { connection } from "next/server";
import { applyProfile, creatorOrg, ProfileInput } from "@/lib/account";
import { body } from "@/lib/http";
import { db, getMe, publicEvent, usernameFree } from "@/lib/store";
import { ORGS } from "@/lib/orgs";
import { prefsOf } from "@/lib/prefs";
import { sharedWith } from "@/lib/friends";
import { normalizeUsername, usernameProblem } from "@/lib/username";
import type { CampusEvent, User } from "@/lib/types";
import { withState } from "@/lib/state";

function profileOf(me: User) {
  return {
    id: me.id,
    name: me.name,
    username: me.username ?? "",
    avatar: me.avatar,
    photo: me.photo ?? null,
    pronouns: me.pronouns ?? "",
    bio: me.bio ?? "",
    email: me.email ?? "",
    school: me.school,
    major: me.major,
    year: me.year,
    verified: !!me.verified,
    interests: me.interests,
    accountType: me.accountType ?? "student",
    creatorOrgId: me.creatorOrgId ?? null,
    creatorOrgName: creatorOrg(me)?.name ?? null,
    friendsCount: me.friends.length,
    clubs: me.orgs.flatMap((id) => { const o = ORGS.find((x) => x.id === id); return o ? [{ id: o.id, name: o.name, logo: o.logo }] : []; }),
    prefs: prefsOf(me),
  };
}
export type ProfileView = ReturnType<typeof profileOf>;

/** Your profile plus the events you're registered for, went to, and host. */
async function GET_() {
  await connection();
  const me = getMe();
  const now = Date.now();
  const d = db();
  const mine = (e: CampusEvent) => e.attendees.includes(me.id);
  const view = (e: CampusEvent) => ({ ...publicEvent(e, me), moderation: e.moderation });
  const upcoming = d.events.filter((e) => mine(e) && +new Date(e.end) > now).sort((a, b) => +new Date(a.start) - +new Date(b.start));
  const past = [...d.events, ...d.history].filter((e) => mine(e) && +new Date(e.end) <= now).sort((a, b) => +new Date(b.start) - +new Date(a.start));
  const hosting = d.events.filter((e) => e.host.id === me.id || (e.host.kind === "org" && me.creatorOrgId && e.host.id === me.creatorOrgId && e.source !== "seed"))
    .sort((a, b) => +new Date(a.start) - +new Date(b.start));
  const goingThisWeek = upcoming.filter((e) => +new Date(e.start) < now + 7 * 86_400_000).length;
  // your friends, each with what you share ("2 classes, 1 event together")
  const friends = me.friends.flatMap((id) => {
    const u = d.users.find((x) => x.id === id);
    return u ? [{ id: u.id, name: u.name, avatar: u.avatar, photo: u.photo?.startsWith("/") ? u.photo : undefined, username: u.username ?? "", shared: sharedWith(me, u, d.events, now).line }] : [];
  }).sort((a, b) => a.name.localeCompare(b.name));
  return Response.json({ profile: profileOf(me), upcoming: upcoming.map(view), past: past.map(view), hosting: hosting.map(view), goingThisWeek, friends });
}

/** Update your own profile (name, pronouns, bio, photo, interests, account type). */
async function PATCH_(req: Request) {
  const b = await body(req, ProfileInput);
  if (!b.ok) return b.res;
  const me = getMe();
  if (b.data.username !== undefined) {
    const u = normalizeUsername(b.data.username);
    const problem = usernameProblem(u);
    if (problem) return Response.json({ error: `Username: ${problem.toLowerCase()}.` }, { status: 400 });
    if (!usernameFree(u, me.id)) return Response.json({ error: `@${u} is taken.` }, { status: 409 });
    me.username = u;
  }
  applyProfile(me, b.data);
  return Response.json({ profile: profileOf(me) });
}

export const GET = withState(GET_);

export const PATCH = withState(PATCH_);
