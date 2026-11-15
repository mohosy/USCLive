import { connection } from "next/server";
import { z } from "zod";
import { answerRequest, cancelRequest, relation, sendRequest, sharedWith, unfriend, type FriendResult } from "@/lib/friends";
import { rateLimit } from "@/lib/rateLimit";
import { sessionUser } from "@/lib/registrationApi";
import { db, getUser, newId, settleFriendRequests } from "@/lib/store";
import { withState } from "@/lib/state";
import type { User } from "@/lib/types";

/**
 * Friends and friend requests. Who is asking always comes from the session cookie, never from the request.
 *   GET    /api/friends                       -> your friends (with what you share), requests to you, requests you sent
 *   POST   /api/friends { userId, action }    -> request (default) | accept | decline | cancel | unfriend
 *   DELETE /api/friends { userId }            -> unfriend
 */
const Input = z.object({ userId: z.string().min(1).max(60), action: z.enum(["request", "accept", "decline", "cancel", "unfriend"]).optional() }).strict();
const json = (data: unknown, status = 200, headers?: Record<string, string>) => Response.json(data, { status, headers });

function person(u: User, me: User) {
  const d = db();
  return {
    id: u.id, name: u.name, avatar: u.avatar, photo: u.photo?.startsWith("/") ? u.photo : undefined, username: u.username ?? "",
    school: u.school, major: u.major, year: u.year,
    relation: relation(d.users, d.friendRequests, me.id, u.id),
    shared: sharedWith(me, u, d.events, Date.now()).line,
  };
}
export type FriendPerson = ReturnType<typeof person>;

function listFor(me: User) {
  const d = db();
  const people = (ids: string[]) => ids.flatMap((id) => { const u = getUser(id); return u ? [person(u, me)] : []; });
  return {
    friends: people(me.friends).sort((a, b) => a.name.localeCompare(b.name)),
    incoming: people(d.friendRequests.filter((r) => r.to === me.id).map((r) => r.from)),
    outgoing: people(d.friendRequests.filter((r) => r.from === me.id).map((r) => r.to)),
  };
}

function signedIn(req: Request, write: boolean): { me: User } | { res: Response } {
  const me = sessionUser(req);
  if (!me) return { res: json({ error: "Sign in to add friends." }, 401) };
  const rl = rateLimit(`friends:${write ? "write" : "read"}:${me.id}`, write ? 30 : 120, 60_000);
  if (!rl.ok) return { res: json({ error: `Too many requests. Try again in ${rl.retryAfterS} seconds.` }, 429, { "Retry-After": String(rl.retryAfterS) }) };
  return { me };
}

async function GET_(req: Request) {
  await connection();
  const who = signedIn(req, false);
  if ("res" in who) return who.res;
  settleFriendRequests();
  return json(listFor(who.me));
}

async function change(req: Request, forced?: "unfriend") {
  const who = signedIn(req, true);
  if ("res" in who) return who.res;
  let raw: unknown;
  try { raw = await req.json(); } catch { return json({ error: "Send JSON." }, 400); }
  const parsed = Input.safeParse(raw);
  if (!parsed.success) return json({ error: "Send { userId } and, optionally, an action." }, 400);
  const { me } = who;
  const d = db();
  const other = parsed.data.userId;
  const action = forced ?? parsed.data.action ?? "request";
  const r: FriendResult =
    action === "request" ? sendRequest(d.users, d.friendRequests, me.id, other, Date.now(), () => newId("fr"))
    : action === "accept" ? answerRequest(d.users, d.friendRequests, me.id, other, true)
    : action === "decline" ? answerRequest(d.users, d.friendRequests, me.id, other, false)
    : action === "cancel" ? cancelRequest(d.friendRequests, me.id, other)
    : unfriend(d.users, d.friendRequests, me.id, other);
  if (!r.ok) return json({ error: r.error }, r.status);
  // friendIds: the browser keeps this list so friends survive a demo-server restart
  return json({ relation: r.relation, becameFriends: r.becameFriends, friendIds: me.friends, ...listFor(me) });
}

export const GET = withState(GET_);
export const POST = withState((req: Request) => change(req));
export const DELETE = withState((req: Request) => change(req, "unfriend"));
