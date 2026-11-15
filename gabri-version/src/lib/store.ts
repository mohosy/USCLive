// All campus times are Pacific; make server-side Date math match (Replit runs in UTC).
process.env.TZ = "America/Los_Angeles";
/**
 * In-memory store (resets on server restart — fine for a hackathon demo, and the demo data
 * is generated relative to "now" so a restart keeps it fresh). Swap for Postgres/Supabase later.
 */
import { BUILDING_BY_ID } from "./campus";
import { ME, ORGS, seedAlerts, seedEvents, seedHistory, seedInbox, seedNotifications, seedUsers } from "./seed";
import type { CampusEvent, InboxItem, Notification, SafetyAlert, User } from "./types";

interface DB {
  seededAt: number;
  users: User[];
  events: CampusEvent[];
  /** past events (for profiles); kept apart so the map, crowds and AI only see current ones */
  history: CampusEvent[];
  inbox: InboxItem[];
  scannedInbox: string[];
  notifications: Notification[];
  alerts: SafetyAlert[];
  dps: { lastSync: number; lastUrl: string | null; error: string | null; syncing: boolean };
  lastLiveTick: number;
  liveScriptIndex: number;
}

const g = globalThis as unknown as { __usclive?: DB };

function fresh(): DB {
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
  };
}

export function db(): DB {
  if (!g.__usclive) g.__usclive = fresh();
  // fill fields added after the store was created (hot reload keeps the old object around)
  const d = g.__usclive;
  d.alerts ??= seedAlerts(new Date());
  d.history ??= seedHistory(new Date());
  d.dps ??= { lastSync: 0, lastUrl: null, error: null, syncing: false };
  return d;
}

export function resetDb() {
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
  return d.alerts.filter((a) => !a.resolved && +new Date(a.expiresAt) > +now);
}

const MAX_NOTIFICATIONS = 200;

/** Pull the DPS Daily Crime Log (at most every 30 min) and merge its incidents into the alerts. */
export async function syncDps(force = false) {
  const d = db();
  if (d.dps.syncing || (!force && Date.now() - d.dps.lastSync < 30 * 60_000)) return d.dps;
  d.dps.syncing = true;
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

export const currentUserId = () => ME;
export const getUser = (id: string) => db().users.find((u) => u.id === id);
export const getMe = () => getUser(ME)!;
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
    invited: e.invitees.includes(viewer.id),
    isClassmate: !!e.course && viewer.classes.some((c) => c.code === e.course),
    lat: b?.lat,
    lng: b?.lng,
    buildingName: b?.name,
    buildingCode: b?.code,
  };
}
export type PublicEvent = ReturnType<typeof publicEvent>;

export function addNotification(n: Omit<Notification, "id" | "createdAt" | "read">) {
  const full: Notification = { ...n, id: newId("n"), createdAt: new Date().toISOString(), read: false };
  const d = db();
  d.notifications.unshift(full);
  if (d.notifications.length > MAX_NOTIFICATIONS) d.notifications.length = MAX_NOTIFICATIONS;
  return full;
}
