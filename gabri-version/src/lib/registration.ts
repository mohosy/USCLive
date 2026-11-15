/**
 * Event registration rules, kept free of runtime imports so they can be tested on their own
 * (scripts/check-registration.mjs). The API routes call these with the request's copy of the data.
 *
 * `event.attendees` stays the list of people who are going (registered or self-reported), because the
 * rest of the app (counts, friends going, your schedule, crowd estimates) already reads it.
 * Waitlisted and cancelled people are never in it.
 */
import type { CampusEvent, Registration, RegistrationStatus, RegistrationType, User } from "./types";

export const CLOSES_SOON_MS = 48 * 3600_000;
const LABEL: Record<RegistrationType, string> = { native: "USCLive", handshake: "Handshake", engage: "Engage", external: "the official page" };
export const registrationSite = (t: RegistrationType) => LABEL[t];

export type RegError = { ok: false; status: 400 | 403 | 404 | 409; code: "not_native" | "not_external" | "closed" | "ended" | "no_registration" | "not_registered"; error: string };
export type RegOk = { ok: true; status: RegistrationStatus; registration: Registration; changed: boolean; promoted?: string };
export type RegResult = RegOk | RegError;

const active = (r: Registration) => r.status !== "cancelled";
const fail = (status: RegError["status"], code: RegError["code"], error: string): RegError => ({ ok: false, status, code, error });

/** Everyone already in `attendees` (seed data, the old RSVP button) gets a "registered" record, so lists and counts are complete. */
export function backfill(ev: CampusEvent, regs: Registration[], newId: () => string) {
  if (!ev.registrationType) return;
  const have = new Set(regs.filter((r) => r.eventId === ev.id).map((r) => r.userId));
  for (const userId of ev.attendees) {
    if (have.has(userId)) continue;
    regs.push({ id: newId(), eventId: ev.id, userId, status: ev.registrationType === "native" ? "registered" : "self-reported", createdAt: ev.createdAt, updatedAt: ev.createdAt });
  }
}

/** After events are rebuilt (demo refresh or reset): put everyone with a live registration back on the going list. */
export function reapply(events: CampusEvent[], regs: Registration[]) {
  const byId = new Map(events.map((e) => [e.id, e]));
  for (const r of regs) {
    const ev = byId.get(r.eventId);
    if (ev && (r.status === "registered" || r.status === "self-reported") && !ev.attendees.includes(r.userId)) ev.attendees.push(r.userId);
  }
}

export const findRegistration = (regs: Registration[], eventId: string, userId: string) => regs.find((r) => r.eventId === eventId && r.userId === userId);

export function counts(ev: CampusEvent, regs: Registration[]) {
  const mine = regs.filter((r) => r.eventId === ev.id);
  const n = (s: RegistrationStatus) => mine.filter((r) => r.status === s).length;
  return { registered: n("registered"), waitlisted: n("waitlisted"), selfReported: n("self-reported"), cancelled: n("cancelled") };
}

export const isFull = (ev: CampusEvent) => ev.capacity != null && ev.attendees.length >= ev.capacity;
export const deadlinePassed = (ev: CampusEvent, now: number) => !!ev.registrationDeadline && now > +new Date(ev.registrationDeadline);
export const hasEnded = (ev: CampusEvent, now: number) => now >= +new Date(ev.end);
/** No new sign-ups: the deadline passed or the event is over. */
export const isClosed = (ev: CampusEvent, now: number) => deadlinePassed(ev, now) || hasEnded(ev, now);
export const closesSoon = (ev: CampusEvent, now: number) => !!ev.registrationDeadline && !deadlinePassed(ev, now) && +new Date(ev.registrationDeadline) - now <= CLOSES_SOON_MS;

function setStatus(ev: CampusEvent, r: Registration, status: RegistrationStatus, now: number, rejoin: boolean) {
  r.status = status;
  r.updatedAt = new Date(now).toISOString();
  if (rejoin) r.createdAt = r.updatedAt; // coming back after cancelling goes to the end of the line
  const going = status === "registered" || status === "self-reported";
  const at = ev.attendees.indexOf(r.userId);
  if (going && at < 0) ev.attendees.push(r.userId);
  if (!going && at >= 0) ev.attendees.splice(at, 1);
}

function upsert(ev: CampusEvent, userId: string, regs: Registration[], status: RegistrationStatus, now: number, newId: () => string) {
  let r = findRegistration(regs, ev.id, userId);
  if (!r) {
    const iso = new Date(now).toISOString();
    r = { id: newId(), eventId: ev.id, userId, status, createdAt: iso, updatedAt: iso };
    regs.push(r);
    setStatus(ev, r, status, now, false);
  } else setStatus(ev, r, status, now, true);
  return r;
}

/**
 * One-tap registration for a native event. Registers when there is room, otherwise joins the waitlist.
 * Asking twice gives the same answer and never a second record.
 */
export function register(ev: CampusEvent, userId: string, regs: Registration[], now: number, newId: () => string): RegResult {
  if (!ev.registrationType) return fail(400, "no_registration", "This event doesn't take registrations. Use RSVP instead.");
  if (ev.registrationType !== "native") return fail(400, "not_native", `Registration for this event happens on ${LABEL[ev.registrationType]}, not in USCLive.`);
  backfill(ev, regs, newId);
  const mine = findRegistration(regs, ev.id, userId);
  if (mine && active(mine)) return { ok: true, status: mine.status, registration: mine, changed: false };
  if (hasEnded(ev, now)) return fail(409, "ended", "This event is over.");
  if (deadlinePassed(ev, now)) return fail(409, "closed", "Registration for this event has closed.");
  const r = upsert(ev, userId, regs, isFull(ev) ? "waitlisted" : "registered", now, newId);
  return { ok: true, status: r.status, registration: r, changed: true };
}

/** Cancel (works for registered, waitlisted and self-reported). Frees a spot: the first person on the waitlist moves up. */
export function cancel(ev: CampusEvent, userId: string, regs: Registration[], now: number, newId: () => string): RegResult {
  if (!ev.registrationType) return fail(400, "no_registration", "This event doesn't take registrations.");
  backfill(ev, regs, newId);
  const mine = findRegistration(regs, ev.id, userId);
  if (!mine || !active(mine)) return fail(404, "not_registered", "You aren't registered for this event.");
  const hadSpot = mine.status === "registered";
  setStatus(ev, mine, "cancelled", now, false);
  let promoted: string | undefined;
  if (hadSpot && ev.registrationType === "native" && !isFull(ev) && !hasEnded(ev, now)) {
    const next = regs.filter((r) => r.eventId === ev.id && r.status === "waitlisted").sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))[0];
    if (next) { setStatus(ev, next, "registered", now, false); promoted = next.userId; }
  }
  return { ok: true, status: "cancelled", registration: mine, changed: true, promoted };
}

/**
 * Handshake / Engage / external events: the student signed up on the official page and tells us so.
 * USCLive cannot check this and never registers anyone there; the record says "self-reported".
 */
export function selfReport(ev: CampusEvent, userId: string, regs: Registration[], now: number, newId: () => string): RegResult {
  if (!ev.registrationType) return fail(400, "no_registration", "This event doesn't take registrations.");
  if (ev.registrationType === "native") return fail(400, "not_external", "This event registers right here in USCLive: use Register.");
  backfill(ev, regs, newId);
  const mine = findRegistration(regs, ev.id, userId);
  if (mine && active(mine)) return { ok: true, status: mine.status, registration: mine, changed: false };
  if (hasEnded(ev, now)) return fail(409, "ended", "This event is over.");
  const r = upsert(ev, userId, regs, "self-reported", now, newId);
  return { ok: true, status: r.status, registration: r, changed: true };
}

/** Who may see an event's registration list: the person hosting it, or a creator account posting for the org that hosts it. */
export function canManage(ev: CampusEvent, viewer: Pick<User, "id" | "accountType" | "creatorOrgId">) {
  if (!ev.host.id) return false;
  if (ev.host.kind === "user") return ev.host.id === viewer.id;
  return ev.host.kind === "org" && viewer.accountType === "creator" && !!viewer.creatorOrgId && viewer.creatorOrgId === ev.host.id;
}

export interface RegistrationRow { name: string; username: string; school: string; status: RegistrationStatus; registeredAt: string }

/** The organizer's list, newest sign-ups last. People without an account in the demo data show as "USC student". */
export function rows(ev: CampusEvent, regs: Registration[], who: (userId: string) => Pick<User, "name" | "username" | "school"> | undefined): RegistrationRow[] {
  const order: Record<RegistrationStatus, number> = { registered: 0, "self-reported": 1, waitlisted: 2, cancelled: 3 };
  return regs.filter((r) => r.eventId === ev.id)
    .sort((a, b) => order[a.status] - order[b.status] || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    .map((r) => { const u = who(r.userId); return { name: u?.name ?? "USC student", username: u?.username ?? "", school: u?.school ?? "", status: r.status, registeredAt: r.createdAt }; });
}

/** CSV with every field quoted; a leading = + - @ is neutralised so spreadsheets never run it as a formula. */
export function toCsv(list: RegistrationRow[]) {
  const cell = (v: string) => `"${(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;
  const head = ["Name", "Username", "School", "Status", "Registered at"];
  return [head, ...list.map((r) => [r.name, r.username ? `@${r.username}` : "", r.school, r.status, r.registeredAt])].map((line) => line.map(cell).join(",")).join("\r\n") + "\r\n";
}
