// All campus times are Pacific; make server-side Date math match (Replit runs in UTC).
process.env.TZ = "America/Los_Angeles";
/**
 * The app's data. Each API request runs inside withState() (lib/state.ts): the whole state is loaded
 * (from Supabase when configured, otherwise kept in memory), the request runs as the signed-in person,
 * and any change is saved back. db() and getMe() read the current request's copy.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { BUILDING_BY_ID } from "./campus";
import { ME, ORGS, seedAlerts, seedEvents, seedHistory, seedInbox, seedNotifications, seedUsers } from "./seed";
import type { CampusEvent, InboxItem, Notification, Registration, SafetyAlert, User } from "./types";
import { backfill, closesSoon, counts, findRegistration, isClosed, reapply } from "./registration";
import type { GoogleSession } from "./google";

export interface DB {
  seededAt: number;
  users: User[];
  events: CampusEvent[];
  /** past events (for profiles); kept apart so the map, crowds and AI only see current ones */
  history: CampusEvent[];
  inbox: InboxItem[];
  scannedInbox: string[];
  notifications: Notification[];
  alerts: SafetyAlert[];
  dps: { lastSync: number; lastUrl: string | null; error: string | null; syncing: boolean; startedAt?: number };
  lastLiveTick: number;
  liveScriptIndex: number;
  /** events we already gave you a "sign up before it fills" heads-up for */
  reminded: string[];
  lastReminder: number;
  /** Google sign-in tokens, per person (server-side only) */
  google: Record<string, GoogleSession>;
  /** event registrations: one per person per event (see lib/registration.ts) */
  registrations: Registration[];
}

/** The current request: its copy of the state and who is signed in. */
export interface ReqCtx { db: DB; uid: string; setCookie?: string }
export const requestCtx = new AsyncLocalStorage<ReqCtx>();

const g = globalThis as unknown as { __usclive?: DB };

export function fresh(): DB {
  const now = new Date();
  const events = seedEvents(now);
  // the demo student is already registered for a couple of upcoming events (shows on their profile)
  for (const e of events) if (/Thornton Jazz Night|Volleyball vs\. UCLA/.test(e.title) && !e.attendees.includes(ME)) e.attendees.push(ME);
  return {
    seededAt: +now,
    users: seedUsers(now),
    events,
    history: seedHistory(now),
    inbox: seedInbox(now),
    scannedInbox: [],
    notifications: seedNotifications(now),
    alerts: seedAlerts(now),
    dps: { lastSync: 0, lastUrl: null, error: null, syncing: false },
    lastLiveTick: +now,
    liveScriptIndex: 0,
    reminded: [],
    lastReminder: 0,
    google: {},
    registrations: [],
  };
}

/** Memory copy, used when Supabase isn't configured (local dev) and outside requests. */
export function memoryDb(): DB {
  return (g.__usclive ??= fresh());
}

export function db(): DB {
  const d = requestCtx.getStore()?.db ?? memoryDb();
  // fill fields added after the state was first saved
  d.alerts ??= seedAlerts(new Date());
  d.history ??= seedHistory(new Date());
  d.dps ??= { lastSync: 0, lastUrl: null, error: null, syncing: false };
  d.reminded ??= [];
  d.lastReminder ??= 0;
  d.google ??= {};
  d.registrations ??= [];
  return d;
}

/** Fresh demo content, keeping people's accounts and Google connections. */
export function resetDb() {
  const c = requestCtx.getStore();
  if (c) {
    const old = c.db, f = fresh();
    f.users = [...f.users, ...old.users.filter((u) => !f.users.some((s) => s.id === u.id))];
    f.google = old.google ?? {};
    // registrations for events that survive the reset (the demo events keep their ids)
    f.registrations = (old.registrations ?? []).filter((r) => f.events.some((e) => e.id === r.eventId));
    reapply(f.events, f.registrations);
    c.db = f;
    return c.db;
  }
  g.__usclive = fresh();
  return g.__usclive;
}

/** DPS alerts still on the map: not resolved and not expired. */
/**
 * Alerts on the map now. Also forgets alerts that expired over a day ago, so the list stays small.
 * (Cleared alerts are kept until they expire, so the next DPS sync can't bring them back.)
 */
export function activeAlerts(now = new Date()) {
  const d = db();
  const dayAgo = +now - 24 * 3600_000;
  if (d.alerts.some((a) => +new Date(a.expiresAt) < dayAgo)) d.alerts = d.alerts.filter((a) => +new Date(a.expiresAt) >= dayAgo);
  const today = campusMidnight(now);
  // only today's incidents: older crime-log entries are history, not something to steer around now
  return d.alerts.filter((a) => !a.resolved && +new Date(a.expiresAt) > +now && +new Date(a.createdAt) >= today);
}

/** Start of today on campus (Los Angeles time), whatever time zone the server runs in. */
function campusMidnight(now: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23" })
    .formatToParts(now).map((x) => [x.type, Number(x.value)]));
  return +now - ((p.hour * 60 + p.minute) * 60 + p.second) * 1000 - now.getMilliseconds();
}

const MAX_NOTIFICATIONS = 300;

/** Notifications this person should see: campus-wide ones plus their own, with their own read state. */
export function myNotifications() {
  const uid = currentUserId();
  return db().notifications
    .filter((n) => !n.userId || n.userId === uid)
    .map((n) => (n.userId ? n : { ...n, read: (n.readBy ?? []).includes(uid) }));
}
/** Mark notifications read for the signed-in person only. */
export function markRead(ids: string[] | "all") {
  const uid = currentUserId();
  for (const n of db().notifications) {
    if (n.userId && n.userId !== uid) continue;
    if (ids !== "all" && !ids.includes(n.id)) continue;
    if (n.userId) n.read = true; else n.readBy = Array.from(new Set([...(n.readBy ?? []), uid]));
  }
}

/** Pull the DPS Daily Crime Log (at most every 30 min) and merge its incidents into the alerts. */
export async function syncDps(force = false) {
  const d = db();
  // a refresh that crashed mid-way must not block the next one forever
  if ((d.dps.syncing && Date.now() - (d.dps.startedAt ?? 0) < 120_000) || (!force && Date.now() - d.dps.lastSync < 30 * 60_000)) return d.dps;
  d.dps.syncing = true;
  d.dps.startedAt = Date.now();
  try {
    const { syncDpsLog } = await import("./dps");
    const r = await syncDpsLog();
    const have = new Set(d.alerts.map((a) => a.id));
    for (const a of r.alerts) if (!have.has(a.id) && +new Date(a.expiresAt) > Date.now()) d.alerts.push(a); // already-expired entries never come back
    Object.assign(d.dps, { lastSync: Date.now(), lastUrl: r.url, error: null });
    console.log(`[dps] synced ${r.alerts.length} alerts from ${r.incidents} log entries (${r.url})`);
  } catch (e) {
    Object.assign(d.dps, { lastSync: Date.now(), error: (e as Error).message });
    console.error("[dps] sync failed:", (e as Error).message);
  } finally {
    d.dps.syncing = false;
  }
  return d.dps;
}

/** Who this request is for: the cookie's account, or the shared demo student. */
export const currentUserId = () => requestCtx.getStore()?.uid ?? ME;
/** Switch this browser to an account (sets the session cookie on the response). */
export function signInAs(uid: string) { const c = requestCtx.getStore(); if (c) { c.uid = uid; c.setCookie = uid; } }
export function signOutCookie() { const c = requestCtx.getStore(); if (c) { c.uid = ME; c.setCookie = ""; } }
export const DEMO_ID = ME;
export const findByUsername = (u: string) => db().users.find((x) => x.username === u);
/** Is this @username free for `forId` (taken by anyone else = not free)? */
export const usernameFree = (u: string, forId: string) => { const owner = findByUsername(u); return !owner || owner.id === forId; };
/** `base`, or base2, base3… if someone else has it. */
export function uniqueUsername(base: string, forId: string) {
  if (usernameFree(base, forId)) return base;
  for (let i = 2; ; i++) if (usernameFree(`${base.slice(0, 18)}${i}`, forId)) return `${base.slice(0, 18)}${i}`;
}
/** Make two users friends (both ways) or unfriend them. */
export function setFriends(a: User, b: User, on: boolean) {
  const link = (x: User, y: User) => { x.friends = on ? Array.from(new Set([...x.friends, y.id])) : x.friends.filter((f) => f !== y.id); };
  link(a, b); link(b, a);
}
export const getUser = (id: string) => db().users.find((u) => u.id === id);
export const getMe = () => getUser(currentUserId()) ?? getUser(ME)!;
export const orgs = () => ORGS;

let counter = 0;
export const newId = (p: string) => `${p}_${Date.now().toString(36)}${(counter++).toString(36)}`;

/** Can this viewer see this event? (privacy + moderation gate, enforced server-side) */
export function canSee(e: CampusEvent, viewer: User) {
  const isHost = e.host.id === viewer.id;
  if (e.moderation.status !== "approved" && !isHost) return false;
  switch (e.visibility) {
    case "public":
    case "open":
      return true;
    case "school":
      return isHost || e.schools.includes("all") || e.schools.includes(viewer.school);
    case "invite":
      return isHost || e.invitees.includes(viewer.id) || e.attendees.includes(viewer.id);
  }
}

/** Strip attendee identities: viewers only see friends by name, everyone else as a count. */
export function publicEvent(e: CampusEvent, viewer: User) {
  const friendsGoing = e.attendees.filter((a) => viewer.friends.includes(a));
  const b = BUILDING_BY_ID[e.buildingId];
  return {
    ...e,
    attendees: undefined,
    invitees: e.host.id === viewer.id ? e.invitees : undefined,
    attendeeCount: e.attendees.length,
    friendsGoing: friendsGoing.map((id) => {
      const u = getUser(id);
      return { id, name: u?.name ?? id, avatar: u?.avatar ?? "?" };
    }),
    going: e.attendees.includes(viewer.id),
    // registration: the viewer's own status plus counts; never anyone else's identity
    registration: e.registrationType ? registrationView(e, viewer.id) : undefined,
    invited: e.invitees.includes(viewer.id),
    isClassmate: !!e.course && viewer.classes.some((c) => c.code === e.course),
    lat: b?.lat,
    lng: b?.lng,
    buildingName: b?.name,
    buildingCode: b?.code,
  };
}
export type PublicEvent = ReturnType<typeof publicEvent>;

/** What a viewer may know about an event's registration: their own status, counts, and whether it is still open. */
export function registrationView(e: CampusEvent, viewerId: string, now = Date.now()) {
  const regs = db().registrations;
  backfill(e, regs, () => newId("reg"));
  const c = counts(e, regs);
  const mine = findRegistration(regs, e.id, viewerId);
  return {
    type: e.registrationType!,
    status: mine && mine.status !== "cancelled" ? mine.status : null,
    waitlisted: c.waitlisted,
    spotsLeft: e.capacity != null ? Math.max(0, e.capacity - e.attendees.length) : null,
    closed: isClosed(e, now),
    closesSoon: closesSoon(e, now),
  };
}

export function addNotification(n: Omit<Notification, "id" | "createdAt" | "read">) {
  const full: Notification = { ...n, id: newId("n"), createdAt: new Date().toISOString(), read: false };
  const d = db();
  d.notifications.unshift(full);
  if (d.notifications.length > MAX_NOTIFICATIONS) d.notifications.length = MAX_NOTIFICATIONS;
  return full;
}
