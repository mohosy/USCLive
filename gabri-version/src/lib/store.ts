// All campus times are Pacific; make server-side Date math match (Replit runs in UTC).
process.env.TZ = "America/Los_Angeles";
/**
 * In-memory store (resets on server restart — fine for a hackathon demo, and the demo data
 * is generated relative to "now" so a restart keeps it fresh). Swap for Postgres/Supabase later.
 */
import { BUILDING_BY_ID } from "./campus";
import { ME, ORGS, seedEvents, seedInbox, seedNotifications, seedUsers } from "./seed";
import type { CampusEvent, InboxItem, Notification, User } from "./types";

interface DB {
  seededAt: number;
  users: User[];
  events: CampusEvent[];
  inbox: InboxItem[];
  scannedInbox: string[];
  notifications: Notification[];
  lastLiveTick: number;
  liveScriptIndex: number;
}

const g = globalThis as unknown as { __usclive?: DB };

function fresh(): DB {
  const now = new Date();
  return {
    seededAt: +now,
    users: seedUsers(now),
    events: seedEvents(now),
    inbox: seedInbox(now),
    scannedInbox: [],
    notifications: seedNotifications(now),
    lastLiveTick: +now,
    liveScriptIndex: 0,
  };
}

export function db(): DB {
  if (!g.__usclive) g.__usclive = fresh();
  return g.__usclive;
}

export function resetDb() {
  g.__usclive = fresh();
  return g.__usclive;
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
  db().notifications.unshift(full);
  return full;
}
