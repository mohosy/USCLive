import { connection } from "next/server";
import { applyProfile, creatorOrg, ProfileInput } from "@/lib/account";
import { body } from "@/lib/http";
import { db, getMe, publicEvent } from "@/lib/store";
import type { CampusEvent, User } from "@/lib/types";

function profileOf(me: User) {
  return {
    id: me.id,
    name: me.name,
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
  };
}
export type ProfileView = ReturnType<typeof profileOf>;

/** Your profile plus the events you're registered for, went to, and host. */
export async function GET() {
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
  return Response.json({ profile: profileOf(me), upcoming: upcoming.map(view), past: past.map(view), hosting: hosting.map(view) });
}

/** Update your own profile (name, pronouns, bio, photo, interests, account type). */
export async function PATCH(req: Request) {
  const b = await body(req, ProfileInput);
  if (!b.ok) return b.res;
  const me = getMe();
  applyProfile(me, b.data);
  return Response.json({ profile: profileOf(me) });
}
