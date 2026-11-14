import { z } from "zod";
import { applyProfile, ProfileInput } from "@/lib/account";
import { directoryLookup, initialsOf, INTERESTS } from "@/lib/directory";
import { body } from "@/lib/http";
import { getMe } from "@/lib/store";

const Input = z.object({
  action: z.enum(["lookup", "signin"]),
  email: z.string().max(120),
  interests: z.array(z.string().max(40)).max(20).optional(),
  accountType: z.enum(["student", "creator"]).optional(),
  creatorOrgId: z.string().max(40).nullable().optional(),
  // profile edits saved in the browser, re-applied after the demo server restarts
  profile: ProfileInput.pick({ name: true, pronouns: true, bio: true, photo: true }).optional(),
});

/**
 * Mock sign-in. `lookup` returns the directory record for a usc.edu address; `signin` makes the demo
 * user that person. School and major always come from the directory on the server: the request can
 * only choose interests (from the fixed list), the account type, and their own profile fields.
 */
export async function POST(req: Request) {
  const b = await body(req, Input);
  if (!b.ok) return b.res;
  const entry = directoryLookup(b.data.email);
  if (!entry) return Response.json({ error: "Only @usc.edu accounts can sign in." }, { status: 403 });
  if (b.data.action === "lookup") return Response.json({ profile: entry });

  const me = getMe();
  const interests = (b.data.interests ?? []).filter((i) => INTERESTS.includes(i));
  Object.assign(me, {
    name: entry.name, avatar: initialsOf(entry.name), school: entry.school, major: entry.major, year: entry.year, interests,
    email: entry.email, accountType: b.data.accountType ?? "student", creatorOrgId: undefined, pronouns: undefined, bio: undefined, photo: undefined,
  });
  applyProfile(me, { ...(b.data.profile ?? {}), creatorOrgId: b.data.creatorOrgId ?? null });
  return Response.json({ profile: entry, interests });
}
