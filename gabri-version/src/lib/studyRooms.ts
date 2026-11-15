/**
 * Bookable study rooms: which places have them, who may book them, what is free, and the rules for picking a time.
 * USCLive never books a room. It shows availability and opens the official booking page.
 *
 * - Library rooms (Leavey, Doheny, Science & Engineering) are read from USC Libraries' public LibCal pages
 *   (see studyRoomsProvider.ts), with a labeled demo fallback when they cannot be reached.
 * - School rooms (Marshall and the others) are demo data, labeled as such: their real systems need a USC sign-in.
 *
 * No runtime imports, so the rules can be checked on their own (scripts/check-study-rooms.mjs).
 */

export type RoomSource = "libcal" | "demo";
export type SlotState = "free" | "booked";

export interface StudyPlace {
  id: string;
  name: string;
  /** one letter for the tile */
  letter: string;
  /** where it is, in words: "Gaughan & Tiberti Library, JFF B1" */
  where: string;
  lat: number;
  lng: number;
  /** the campus building it sits in, when the app knows it (for walking-time conflicts) */
  buildingId?: string;
  /** a school id: only that school's students may book. Absent: open to every student. */
  school?: string;
  /** USC Libraries LibCal location id (library rooms only) */
  libcalId?: number;
  /** what the booking system is called on the button: "Book on USC Libraries" */
  system: string;
  /** the official page the Book button opens when there is no room-specific one */
  bookUrl: string;
  /** hours you may hold a room per day */
  dailyLimitHours: number;
  /** rooms for places without a live feed, and for the demo fallback */
  demoRooms: Room[];
}

export interface Room {
  id: string;
  name: string;
  seats: number;
  /** "TV", "whiteboard" */
  features: string[];
  /** the room's own official booking page, when there is one */
  url?: string;
}

export interface Availability {
  placeId: string;
  /** YYYY-MM-DD, campus time */
  date: string;
  /** the hours shown as columns: each is the hour a one-hour slot starts (24h) */
  hours: number[];
  rooms: Room[];
  /** room id -> hour -> free or booked (a missing hour is not bookable) */
  slots: Record<string, Record<number, SlotState>>;
  source: RoomSource;
  /** "Live from USC Libraries" / "Demo availability" */
  sourceLabel: string;
}

const LIBCAL = "https://libcal.usc.edu";
const room = (id: string, name: string, seats: number, ...features: string[]): Room => ({ id, name, seats, features });
const numbered = (prefix: string, seats: number[], extras: Record<number, string[]> = {}): Room[] =>
  seats.map((s, i) => room(`${prefix}-${i + 1}`, `Room ${i + 1}`, s, ...(extras[i + 1] ?? [])));

/** Every place with bookable rooms. Library rooms carry a LibCal id; the rest are demo data. */
export const STUDY_PLACES: StudyPlace[] = [
  { id: "marshall-breakout", name: "Marshall breakout rooms", letter: "M", where: "Gaughan & Tiberti Library, JFF B1", lat: 34.018736, lng: -118.282439, buildingId: "jff", school: "marshall",
    system: "Marshall's system", bookUrl: "https://www.marshall.usc.edu/", dailyLimitHours: 2,
    demoRooms: numbered("mb", [6, 4, 8, 4, 6, 10], { 1: ["TV"], 3: ["TV"], 5: ["whiteboard"], 6: ["TV"] }) },
  { id: "accounting-library", name: "Accounting Library rooms", letter: "A", where: "Hoffman Hall", lat: 34.018973, lng: -118.285626, buildingId: "hoh", school: "marshall",
    system: "Marshall's system", bookUrl: "https://www.marshall.usc.edu/", dailyLimitHours: 2,
    demoRooms: numbered("al", [4, 4, 6, 6, 4, 8, 4, 6], { 3: ["whiteboard"], 6: ["TV"] }) },
  { id: "viterbi-rooms", name: "Viterbi study rooms", letter: "V", where: "Ronald Tutor Hall, 2nd floor", lat: 34.020109, lng: -118.289763, buildingId: "rth", school: "viterbi",
    system: "Viterbi's system", bookUrl: "https://viterbischool.usc.edu/", dailyLimitHours: 2,
    demoRooms: numbered("vr", [4, 6, 6, 8, 4], { 2: ["whiteboard"], 4: ["TV", "whiteboard"] }) },
  { id: "annenberg-rooms", name: "Annenberg media rooms", letter: "N", where: "Wallis Annenberg Hall", lat: 34.020772, lng: -118.286974, buildingId: "ann", school: "annenberg",
    system: "Annenberg's system", bookUrl: "https://annenberg.usc.edu/", dailyLimitHours: 2,
    demoRooms: numbered("an", [4, 6, 4, 8], { 2: ["TV"], 4: ["TV"] }) },
  { id: "sca-rooms", name: "Cinematic Arts screening rooms", letter: "C", where: "Cinematic Arts Complex", lat: 34.02338, lng: -118.286155, buildingId: "sci", school: "sca",
    system: "SCA's system", bookUrl: "https://cinema.usc.edu/", dailyLimitHours: 2,
    demoRooms: numbered("sc", [6, 8, 10], { 1: ["TV"], 2: ["TV"], 3: ["TV"] }) },
  { id: "thornton-practice", name: "Thornton practice rooms", letter: "T", where: "Thornton School of Music", lat: 34.022731, lng: -118.285254, buildingId: "mus", school: "thornton",
    system: "Thornton's system", bookUrl: "https://music.usc.edu/", dailyLimitHours: 2,
    demoRooms: numbered("tp", [2, 2, 2, 4, 4, 2]) },
  { id: "leavey", name: "Leavey Library group rooms", letter: "L", where: "Leavey Library", lat: 34.021848, lng: -118.282864, buildingId: "lvl", libcalId: 2895,
    system: "USC Libraries", bookUrl: `${LIBCAL}/spaces?lid=2895`, dailyLimitHours: 2,
    demoRooms: numbered("lv", [6, 6, 8, 4, 6, 8, 4, 6, 10, 4, 6, 8], { 3: ["TV"], 6: ["TV"], 9: ["TV", "whiteboard"], 12: ["whiteboard"] }) },
  { id: "doheny", name: "Doheny study rooms", letter: "D", where: "Doheny Memorial Library", lat: 34.020216, lng: -118.283729, buildingId: "dml", libcalId: 2893,
    system: "USC Libraries", bookUrl: `${LIBCAL}/spaces?lid=2893`, dailyLimitHours: 2,
    demoRooms: numbered("dh", [6, 6, 6, 6, 4, 4]) },
  { id: "science-engineering", name: "Science & Engineering Library", letter: "S", where: "Science & Engineering Library", lat: 34.019471, lng: -118.288763, libcalId: 13141,
    system: "USC Libraries", bookUrl: `${LIBCAL}/spaces?lid=13141`, dailyLimitHours: 2,
    demoRooms: numbered("se", [4, 6, 6, 8], { 4: ["whiteboard"] }) },
];

export const placeById = (id: string) => STUDY_PLACES.find((p) => p.id === id);

export type PlaceGroup = "yours" | "open" | "locked";
/** For you (your school's rooms), open to every student (the libraries), or another school's (locked). */
export function groupFor(p: StudyPlace, mySchool: string): PlaceGroup {
  if (!p.school) return "open";
  return p.school === mySchool ? "yours" : "locked";
}

/** YYYY-MM-DD in campus time */
export function campusDate(d: Date) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return p.slice(0, 10);
}
/** the hour of day in campus time (0-23) */
export function campusHour(d: Date) {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", hourCycle: "h23" }).format(d)) % 24;
}
export const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`));

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

export const DEMO_HOURS = [10, 11, 12, 13, 14, 15, 16, 17];
/** Made-up availability, the same every time for a place and a day (about a third of the slots taken). Always labeled. */
export function demoAvailability(p: StudyPlace, date: string, why = "Demo availability"): Availability {
  const slots: Availability["slots"] = {};
  for (const r of p.demoRooms) {
    slots[r.id] = {};
    for (const h of DEMO_HOURS) slots[r.id][h] = hash(`${p.id}:${r.id}:${date}:${h}`) < 0.36 ? "booked" : "free";
  }
  return { placeId: p.id, date, hours: DEMO_HOURS, rooms: p.demoRooms, slots, source: "demo", sourceLabel: why };
}

/**
 * Rooms listed on a LibCal "spaces" page for one location. Titles look like "East Asian-109C (Capacity 6)"
 * (escaped as   etc. in the page's script). Anything that does not look like a room is skipped.
 */
export function parseLibcalRooms(html: string, lid: number): Room[] {
  const out: Room[] = [];
  const unescape = (s: string) => s.replace(/\\u([0-9a-fA-F]{4})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16))).replace(/\\\//g, "/");
  for (const m of html.matchAll(/resources\.push\(\{([\s\S]*?)\}\);?/g)) {
    const body = m[1];
    const eid = Number(/\beid:\s*(\d+)/.exec(body)?.[1]);
    const itemLid = Number(/\blid:\s*(\d+)/.exec(body)?.[1]);
    const title = unescape(/\btitle:\s*"((?:[^"\\]|\\.)*)"/.exec(body)?.[1] ?? "");
    const cap = Number(/\bcapacity:\s*(\d+)/.exec(body)?.[1]);
    if (!Number.isInteger(eid) || eid <= 0 || itemLid !== lid || !title || title.length > 120) continue;
    const name = title.replace(/\s*\(Capacity\s*\d+\)\s*$/i, "").trim() || title;
    out.push({ id: String(eid), name, seats: Number.isFinite(cap) && cap > 0 && cap < 200 ? cap : 0, features: [], url: `${LIBCAL}/space/${eid}` });
    if (out.length >= 60) break;
  }
  return out;
}

/**
 * LibCal's availability grid for one day: one-hour (or shorter) slots per room; a slot with the class
 * "s-lc-eq-checkout" (or any class) is taken. Returns the hours seen and each room's state per hour.
 * Slots for another day, for unknown rooms, or with a bad time are dropped.
 */
export function parseLibcalGrid(json: unknown, date: string, roomIds: string[]): { hours: number[]; slots: Availability["slots"] } {
  const list = json && typeof json === "object" && Array.isArray((json as { slots?: unknown }).slots) ? ((json as { slots: unknown[] }).slots) : [];
  const known = new Set(roomIds);
  const slots: Availability["slots"] = {};
  const hours = new Set<number>();
  for (const raw of list.slice(0, 5000)) {
    const s = raw as { start?: unknown; itemId?: unknown; className?: unknown };
    const m = typeof s.start === "string" ? /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/.exec(s.start) : null;
    const id = String(s.itemId ?? "");
    if (!m || m[1] !== date || !known.has(id)) continue;
    const h = Number(m[2]);
    if (h < 0 || h > 23) continue;
    hours.add(h);
    const taken = typeof s.className === "string" && s.className.trim() !== "";
    const cur = (slots[id] ??= {})[h];
    // a half-hour grid has two slots per hour: the hour is free only if both halves are
    slots[id][h] = cur === "booked" || taken ? "booked" : "free";
  }
  return { hours: [...hours].sort((a, b) => a - b), slots };
}

/** How many rooms are free right now, and until when the longest of them stays free ("4 free now · until 2 PM"). */
export function freeNow(av: Availability, hourNow: number): { free: number; untilHour: number | null; nextHour: number | null } {
  let free = 0, until: number | null = null;
  for (const r of av.rooms) {
    if (av.slots[r.id]?.[hourNow] !== "free") continue;
    free++;
    let h = hourNow;
    while (av.slots[r.id]?.[h + 1] === "free") h++;
    until = Math.max(until ?? 0, h + 1);
  }
  // nothing free this hour: the next hour today that has a free room ("from 10 AM")
  const nextHour = free ? null : av.hours.find((h) => h > hourNow && av.rooms.some((r) => av.slots[r.id]?.[h] === "free")) ?? null;
  return { free, untilHour: until, nextHour };
}

export interface Pick { roomId: string; startHour: number; hours: number }

/**
 * Tapping a slot: a new pick, or one more hour on the pick you have (same room, the hour right before or after),
 * up to the daily limit. Tapping your own pick clears it. Booked or missing slots are ignored.
 */
export function tapSlot(av: Availability, pick: Pick | null, roomId: string, hour: number, limitHours: number): Pick | null {
  if (av.slots[roomId]?.[hour] !== "free") return pick;
  if (pick && pick.roomId === roomId) {
    if (hour >= pick.startHour && hour < pick.startHour + pick.hours) return null;
    if (pick.hours < limitHours && hour === pick.startHour + pick.hours) return { ...pick, hours: pick.hours + 1 };
    if (pick.hours < limitHours && hour === pick.startHour - 1) return { roomId, startHour: hour, hours: pick.hours + 1 };
  }
  return { roomId, startHour: hour, hours: 1 };
}

/** Why a pick cannot be booked, or null when it can: every hour must be free and within the daily limit. */
export function pickProblem(av: Availability, pick: Pick, limitHours: number): string | null {
  if (!av.rooms.some((r) => r.id === pick.roomId)) return "That room is not on this list.";
  if (pick.hours < 1) return "Pick at least one hour.";
  if (pick.hours > limitHours) return `You can hold a room for ${limitHours} hours a day at most.`;
  for (let h = pick.startHour; h < pick.startHour + pick.hours; h++) if (av.slots[pick.roomId]?.[h] !== "free") return "Part of that time is already booked.";
  return null;
}

const h12 = (h: number) => `${h % 12 || 12}${h % 24 < 12 ? " AM" : " PM"}`;
export const hourLabel = h12;
/** "12:00 – 2:00 PM" for a pick */
export function pickRange(p: Pick) {
  const a = p.startHour, b = p.startHour + p.hours;
  const ap = (h: number) => (h % 24 < 12 ? "AM" : "PM");
  return ap(a) === ap(b) ? `${a % 12 || 12}:00 – ${b % 12 || 12}:00 ${ap(b)}` : `${a % 12 || 12}:00 ${ap(a)} – ${b % 12 || 12}:00 ${ap(b)}`;
}

/**
 * The official page the Book button opens. Library rooms open that room's own LibCal page on the chosen day
 * (the time is then picked there); the others open their school's site. USCLive itself books nothing.
 */
export function bookingUrl(p: { live: boolean; bookUrl: string }, r: Room | undefined, date: string) {
  return p.live && r?.url && validDate(date) ? `${r.url}?date=${date}` : p.bookUrl;
}
