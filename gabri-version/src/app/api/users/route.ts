import { connection } from "next/server";
import { db, getMe, usernameFree } from "@/lib/store";
import { normalizeUsername, usernameProblem } from "@/lib/username";
import type { User } from "@/lib/types";
import { withState } from "@/lib/state";

/** What a student can see about another student: no email, schedule or clubs. */
function personView(u: User, me: User) {
  const mutual = u.friends.filter((f) => f !== me.id && me.friends.includes(f));
  return {
    id: u.id, name: u.name, avatar: u.avatar, photo: u.photo?.startsWith("/") ? u.photo : undefined, username: u.username ?? "",
    school: u.school, major: u.major, year: u.year,
    isFriend: me.friends.includes(u.id),
    mutualCount: mutual.length,
    mutualNames: mutual.slice(0, 2).map((id) => db().users.find((x) => x.id === id)?.name.split(" ")[0] ?? ""),
  };
}
export type PersonView = ReturnType<typeof personView>;

/**
 * GET /api/users?q=ryan       -> people whose @username or name matches (best matches first)
 * GET /api/users              -> your friends + suggestions (most mutual friends first)
 * GET /api/users?username=x   -> { available, problem } for sign-up / Settings
 */
async function GET_(req: Request) {
  await connection();
  const url = new URL(req.url);
  const me = getMe();

  const check = url.searchParams.get("username");
  if (check !== null) {
    const u = normalizeUsername(check);
    const problem = usernameProblem(u);
    return Response.json({ username: u, available: !problem && usernameFree(u, me.id), problem: problem ?? (usernameFree(u, me.id) ? null : "Taken") });
  }

  const others = db().users.filter((u) => u.id !== me.id && !u.id.startsWith("anon"));
  const q = normalizeUsername(url.searchParams.get("q") ?? "").slice(0, 40);
  if (!q) {
    const friends = others.filter((u) => me.friends.includes(u.id)).sort((a, b) => a.name.localeCompare(b.name));
    const suggested = others
      .filter((u) => !me.friends.includes(u.id))
      .map((u) => personView(u, me))
      .sort((a, b) => b.mutualCount - a.mutualCount || a.name.localeCompare(b.name))
      .slice(0, 8);
    return Response.json({ friends: friends.map((u) => personView(u, me)), suggested });
  }
  // rank: exact @username, username starts with, name word starts with, contains anywhere
  const score = (u: User) => {
    const un = u.username ?? "", name = u.name.toLowerCase();
    if (un === q) return 4;
    if (un.startsWith(q)) return 3;
    if (name.split(/\s+/).some((w) => w.startsWith(q)) || name.startsWith(q)) return 2;
    if (un.includes(q) || name.includes(q)) return 1;
    return 0;
  };
  const results = others
    .map((u) => ({ u, s: score(u) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.u.name.localeCompare(b.u.name))
    .slice(0, 12)
    .map((x) => personView(x.u, me));
  return Response.json({ results });
}

export const GET = withState(GET_);
