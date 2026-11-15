/**
 * Your schedule, for the conflict rules in lib/conflicts.ts: your classes on the event's day and the events you
 * are already going to (registered, said you registered, or RSVP'd). Imports nothing from the store, so the
 * store can use it for the mark on each event.
 */
import { BUILDING_BY_ID, walkMinutes } from "./campus";
import { conflictMark, findConflicts, type Busy, type Conflict } from "./conflicts";
import type { CampusEvent, User } from "./types";

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + (m || 0); };
const walk = (a: string, b: string) => { const x = BUILDING_BY_ID[a], y = BUILDING_BY_ID[b]; return x && y ? walkMinutes(x, y) : null; };

/** What is already on `me`'s schedule around `ev`: classes that meet that day, and other events they are going to. */
export function scheduleAround(me: User, ev: CampusEvent, events: CampusEvent[]): Busy[] {
  const day = new Date(ev.start);
  const at = (hhmm: string) => { const d = new Date(day); d.setHours(0, 0, 0, 0); d.setMinutes(toMin(hhmm)); return d.toISOString(); };
  const classes: Busy[] = me.classes.filter((c) => c.days.includes(day.getDay()))
    .map((c) => ({ kind: "class", id: c.code, label: c.code, start: at(c.start), end: at(c.end), buildingId: c.buildingId, place: c.room }));
  const going: Busy[] = events.filter((e) => e.id !== ev.id && e.attendees.includes(me.id))
    .map((e) => ({ kind: "event", id: e.id, label: e.title, start: e.start, end: e.end, buildingId: e.buildingId, place: e.room || BUILDING_BY_ID[e.buildingId]?.code }));
  return [...classes, ...going];
}

/** What is on `me`'s schedule on one day (YYYY-MM-DD): classes that meet that day and events they are going to that day. */
export function scheduleOn(me: User, date: string, events: CampusEvent[]): Busy[] {
  const [y, m, d] = date.split("-").map(Number);
  const noon = new Date(y, (m || 1) - 1, d || 1, 12).toISOString();
  const day = new Date(noon).toDateString();
  return scheduleAround(me, { id: "", start: noon, end: noon } as CampusEvent, events).filter((b) => new Date(b.start).toDateString() === day);
}

/** Every clash between `ev` and `me`'s schedule: overlaps, and back-to-back events too far apart to walk. */
export function conflictsFor(me: User, ev: CampusEvent, events: CampusEvent[]): Conflict[] {
  return findConflicts(ev, scheduleAround(me, ev, events), walk);
}

/** The mark for an event you are going to that clashes with something ("Overlaps FBE 403"), else null. */
export function myConflictMark(me: User, ev: CampusEvent, events: CampusEvent[]): string | null {
  return ev.attendees.includes(me.id) ? conflictMark(conflictsFor(me, ev, events)) : null;
}
