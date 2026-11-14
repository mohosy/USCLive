import { z } from "zod";
import { directoryLookup, initialsOf, INTERESTS } from "@/lib/directory";
import { body } from "@/lib/http";
import { getMe } from "@/lib/store";

const Input = z.object({
  action: z.enum(["lookup", "signin"]),
  email: z.string().max(120),
  interests: z.array(z.string().max(40)).max(20).optional(),
});

/**
 * Mock sign-in. `lookup` returns the directory record for a usc.edu address; `signin` makes the demo
 * user that person. School and major always come from the directory on the server: the request can
 * only choose interests, and only from the fixed list.
 */
export async function POST(req: Request) {
  const b = await body(req, Input);
  if (!b.ok) return b.res;
  const entry = directoryLookup(b.data.email);
  if (!entry) return Response.json({ error: "Only @usc.edu accounts can sign in." }, { status: 403 });
  if (b.data.action === "lookup") return Response.json({ profile: entry });

  const me = getMe();
  const interests = (b.data.interests ?? []).filter((i) => INTERESTS.includes(i));
  Object.assign(me, { name: entry.name, avatar: initialsOf(entry.name), school: entry.school, major: entry.major, year: entry.year, interests });
  return Response.json({ profile: entry, interests });
}
