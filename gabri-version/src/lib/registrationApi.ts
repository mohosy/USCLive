/**
 * Shared plumbing for the registration routes: who is asking (always the session cookie, never the request
 * body), the rate limit, input checks, and the notifications that go with a change.
 */
import { z } from "zod";
import { BUILDING_BY_ID } from "./campus";
import { rateLimit } from "./rateLimit";
import type { RegResult } from "./registration";
import { conflictsFor } from "./conflictCheck";
import { conflictDecision } from "./conflicts";
import { addNotification, canSee, currentUserId, db, getUser, publicEvent } from "./store";
import type { CampusEvent, User } from "./types";

const Params = z.object({ id: z.string().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/) });
const json = (body: unknown, status: number, headers?: Record<string, string>) => Response.json(body, { status, headers });

/** The signed-in person, from the session cookie only. null = nobody is signed in on this browser. */
export function sessionUser(req: Request): User | null {
  const uid = req.headers.get("cookie")?.match(/(?:^|;\s*)ul_uid=([^;]+)/)?.[1];
  if (!uid || uid !== currentUserId()) return null; // no cookie, or a cookie for an account that no longer exists
  return getUser(uid) ?? null;
}

export type Guard = { ok: true; me: User; ev: CampusEvent } | { ok: false; res: Response };

/** Signed in? Within the rate limit? Is the event id well-formed, real, and visible to this person? */
export async function guard(req: Request, ctx: { params: Promise<{ id: string }> }, bucket: "write" | "read"): Promise<Guard> {
  const me = sessionUser(req);
  if (!me) return { ok: false, res: json({ error: "Sign in to register for events." }, 401) };
  const rl = rateLimit(`${bucket}:${me.id}`, bucket === "write" ? 20 : 60, 60_000);
  if (!rl.ok) return { ok: false, res: json({ error: `Too many requests. Try again in ${rl.retryAfterS} seconds.` }, 429, { "Retry-After": String(rl.retryAfterS) }) };
  const p = Params.safeParse(await ctx.params);
  if (!p.success) return { ok: false, res: json({ error: "Invalid event id" }, 400) };
  const ev = db().events.find((e) => e.id === p.data.id);
  if (!ev || !canSee(ev, me)) return { ok: false, res: json({ error: "Event not found" }, 404) };
  return { ok: true, me, ev };
}

/**
 * These routes take no input beyond the event id in the address. A body is optional; if one is sent it must
 * match `schema` exactly, so a stray `userId` (or anything else) is refused instead of silently ignored.
 */
export async function readBody<S extends z.ZodType>(req: Request, schema: S, required: boolean): Promise<{ ok: true; data: z.infer<S> | null } | { ok: false; res: Response }> {
  const text = await req.text();
  if (!text.trim()) return required ? { ok: false, res: json({ error: "Missing request body" }, 400) } : { ok: true, data: null };
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, res: json({ error: "Invalid JSON" }, 400) }; }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, res: json({ error: "Invalid input", issues: parsed.error.issues }, 400) };
  return { ok: true, data: parsed.data };
}

/** What a sign-up may send: nothing, or "anyway" after the person saw the schedule conflicts and chose to go ahead. */
export const SignUpBody = z.object({ anyway: z.literal(true).optional() }).strict();

/**
 * Before signing someone up: does this event clash with their classes or with events they are already going to?
 * Returns the 409 answer listing the conflicts, or null to go ahead (no conflicts, or they said "Register anyway").
 */
export function conflictStop(ev: CampusEvent, me: User, anyway: boolean): Response | null {
  if (ev.attendees.includes(me.id)) return null; // already going: nothing new to warn about
  const conflicts = conflictsFor(me, ev, db().events);
  if (conflictDecision(conflicts, anyway) === "go") return null;
  return json({ error: conflicts[0].text, code: "conflict", conflicts }, 409);
}

const whenWhere = (ev: CampusEvent) => {
  const when = new Date(ev.start).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });
  return `${when} · ${BUILDING_BY_ID[ev.buildingId]?.name ?? ""}`;
};

/** Turn the result of a registration rule into a response, and tell the people it affects. */
export function respond(ev: CampusEvent, me: User, r: RegResult) {
  if (!r.ok) return json({ error: r.error, code: r.code }, r.status);
  if (r.changed) {
    if (r.status === "registered") addNotification({ userId: me.id, kind: "event", title: `Registered: ${ev.title}`, body: `${whenWhere(ev)} · added to your schedule`, eventId: ev.id, source: "live" });
    if (r.status === "waitlisted") addNotification({ userId: me.id, kind: "event", title: `On the waitlist: ${ev.title}`, body: "We'll tell you if a spot opens up", eventId: ev.id, source: "live" });
    if (r.status === "self-reported") addNotification({ userId: me.id, kind: "event", title: `Saved: ${ev.title}`, body: `${whenWhere(ev)} · you said you registered on the official page`, eventId: ev.id, source: "live" });
    if (r.promoted) addNotification({ userId: r.promoted, kind: "event", title: `A spot opened up: ${ev.title}`, body: `You're off the waitlist and registered · ${whenWhere(ev)}`, eventId: ev.id, source: "live" });
  }
  return json({ status: r.status, changed: r.changed, event: publicEvent(ev, me) }, 200);
}
