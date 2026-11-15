/**
 * Friend requests and what two people share. Kept free of runtime imports so the rules can be checked on their
 * own (scripts/check-friends.mjs). The API routes call these with the request's copy of the data and the
 * signed-in user's id, never an id from the request body.
 *
 * A request is pending until it is accepted (both become friends), declined or cancelled; then it is removed.
 */
import type { FriendRequest } from "./types";

type Person = { id: string; friends: string[]; classes?: { code: string }[] };
export type Relation = "self" | "friends" | "outgoing" | "incoming" | "none";
export type FriendError = { ok: false; status: 400 | 404 | 409; error: string };
export type FriendOk = { ok: true; relation: Relation; /** the two became friends in this call */ becameFriends: boolean };
export type FriendResult = FriendOk | FriendError;

const fail = (status: FriendError["status"], error: string): FriendError => ({ ok: false, status, error });
const done = (relation: Relation, becameFriends = false): FriendOk => ({ ok: true, relation, becameFriends });
/** people you can befriend: real accounts and demo students, never the anonymous crowd */
const real = (u: Person | undefined): u is Person => !!u && !u.id.startsWith("anon");
const find = (users: Person[], id: string) => users.find((u) => u.id === id);
const pending = (reqs: FriendRequest[], from: string, to: string) => reqs.findIndex((r) => r.from === from && r.to === to);

function link(a: Person, b: Person, on: boolean) {
  const set = (x: Person, y: Person) => { x.friends = on ? Array.from(new Set([...x.friends, y.id])) : x.friends.filter((f) => f !== y.id); };
  set(a, b); set(b, a);
}

/** How `meId` stands with `otherId` right now. */
export function relation(users: Person[], reqs: FriendRequest[], meId: string, otherId: string): Relation {
  if (meId === otherId) return "self";
  if (find(users, meId)?.friends.includes(otherId)) return "friends";
  if (pending(reqs, meId, otherId) >= 0) return "outgoing";
  if (pending(reqs, otherId, meId) >= 0) return "incoming";
  return "none";
}

/** Send a request. If they already asked you, this accepts theirs instead. Never a duplicate, never to yourself. */
export function sendRequest(users: Person[], reqs: FriendRequest[], meId: string, otherId: string, now: number, newId: () => string): FriendResult {
  const me = find(users, meId), other = find(users, otherId);
  if (meId === otherId) return fail(400, "You can't add yourself.");
  if (!real(me) || !real(other)) return fail(404, "No one with that account.");
  if (me.friends.includes(other.id)) return fail(409, "You're already friends.");
  if (pending(reqs, meId, otherId) >= 0) return fail(409, "You already sent a request.");
  const theirs = pending(reqs, otherId, meId);
  if (theirs >= 0) { reqs.splice(theirs, 1); link(me, other, true); return done("friends", true); }
  reqs.push({ id: newId(), from: meId, to: otherId, createdAt: new Date(now).toISOString() });
  return done("outgoing");
}

/** Accept or decline the request `fromId` sent you. */
export function answerRequest(users: Person[], reqs: FriendRequest[], meId: string, fromId: string, accept: boolean): FriendResult {
  const i = pending(reqs, fromId, meId);
  if (i < 0) return fail(404, "That request is no longer there.");
  const me = find(users, meId), other = find(users, fromId);
  reqs.splice(i, 1);
  if (!accept) return done("none");
  if (!real(me) || !real(other)) return fail(404, "No one with that account.");
  link(me, other, true);
  return done("friends", true);
}

/** Take back a request you sent. */
export function cancelRequest(reqs: FriendRequest[], meId: string, toId: string): FriendResult {
  const i = pending(reqs, meId, toId);
  if (i < 0) return fail(404, "That request is no longer there.");
  reqs.splice(i, 1);
  return done("none");
}

/** Stop being friends (both ways). Any request between the two is dropped too. */
export function unfriend(users: Person[], reqs: FriendRequest[], meId: string, otherId: string): FriendResult {
  const me = find(users, meId), other = find(users, otherId);
  if (!real(me) || !real(other) || meId === otherId) return fail(404, "No one with that account.");
  if (!me.friends.includes(other.id)) return fail(409, "You're not friends.");
  link(me, other, false);
  for (let i = reqs.length - 1; i >= 0; i--) if ((reqs[i].from === meId && reqs[i].to === otherId) || (reqs[i].from === otherId && reqs[i].to === meId)) reqs.splice(i, 1);
  return done("none");
}

/**
 * Demo students are not real people, so nobody is there to tap Accept: a request to one of them is accepted
 * after a short wait. Requests to real accounts (anyone in `realIds`) are never touched.
 */
export function settleDemoRequests(users: Person[], reqs: FriendRequest[], realIds: Set<string>, now: number, afterMs = 8000) {
  let changed = false;
  for (let i = reqs.length - 1; i >= 0; i--) {
    const r = reqs[i];
    if (realIds.has(r.to) || now - +new Date(r.createdAt) < afterMs) continue;
    const a = find(users, r.from), b = find(users, r.to);
    reqs.splice(i, 1);
    if (real(a) && real(b)) { link(a, b, true); changed = true; }
  }
  return changed;
}

/** What you and a friend share: classes in common and upcoming events you are both going to. */
export function sharedWith(me: Person, other: Person, events: { attendees: string[]; end: string }[], now: number) {
  const mine = new Set((me.classes ?? []).map((c) => c.code));
  const classes = new Set((other.classes ?? []).map((c) => c.code).filter((c) => mine.has(c))).size;
  const together = events.filter((e) => +new Date(e.end) > now && e.attendees.includes(me.id) && e.attendees.includes(other.id)).length;
  const parts = [classes ? `${classes} class${classes === 1 ? "" : "es"}` : "", together ? `${together} event${together === 1 ? "" : "s"}` : ""].filter(Boolean);
  return { classes, events: together, line: parts.length ? `${parts.join(", ")} together` : "" };
}
