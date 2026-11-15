/**
 * Where study-room availability comes from.
 * Library rooms: USC Libraries' public LibCal pages (the room list from the location's page, the day's grid from
 * the same endpoint that page calls). Polite: one request per place and day per hour at most, cached, with a clear
 * User-Agent. If LibCal cannot be reached or answers with something unexpected, a labeled demo grid is shown instead.
 * School rooms: demo data, always labeled.
 */
import { demoAvailability, parseLibcalGrid, parseLibcalRooms, type Availability, type Room, type StudyPlace } from "./studyRooms";

const LIBCAL = "https://libcal.usc.edu";
const UA = "USCLive-student-project/0.1 (USC campus map; study room availability; hourly at most)";
const HOUR = 3600_000;
const g = globalThis as unknown as { __uscliveRooms?: { rooms: Map<number, { at: number; rooms: Room[] }>; days: Map<string, { at: number; av: Availability }> } };
const cache = () => (g.__uscliveRooms ??= { rooms: new Map(), days: new Map() });

async function libcalRooms(lid: number): Promise<Room[]> {
  const hit = cache().rooms.get(lid);
  if (hit && Date.now() - hit.at < 24 * HOUR) return hit.rooms;
  const res = await fetch(`${LIBCAL}/spaces?lid=${lid}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!res.ok) throw new Error(`LibCal page ${res.status}`);
  const rooms = parseLibcalRooms(await res.text(), lid);
  if (!rooms.length) throw new Error("LibCal page listed no rooms");
  cache().rooms.set(lid, { at: Date.now(), rooms });
  return rooms;
}

const nextDay = (date: string) => new Date(Date.parse(`${date}T12:00:00Z`) + 24 * HOUR).toISOString().slice(0, 10);

async function libcalDay(p: StudyPlace, date: string): Promise<Availability> {
  const lid = p.libcalId!;
  const rooms = await libcalRooms(lid);
  const res = await fetch(`${LIBCAL}/spaces/availability/grid`, {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest", Referer: `${LIBCAL}/spaces?lid=${lid}` },
    body: new URLSearchParams({ lid: String(lid), gid: "0", eid: "-1", seat: "0", seatId: "0", zone: "0", start: date, end: nextDay(date), pageIndex: "0", pageSize: "18" }),
    signal: AbortSignal.timeout(8000), cache: "no-store",
  });
  if (!res.ok) throw new Error(`LibCal grid ${res.status}`);
  const { hours, slots } = parseLibcalGrid(await res.json(), date, rooms.map((r) => r.id));
  // a day with no slots at all (closed, or past the booking window) is a real answer: nothing is bookable
  return { placeId: p.id, date, hours: hours.length ? hours : [], rooms, slots, source: "libcal", sourceLabel: "Live from USC Libraries (LibCal)" };
}

/** Availability for one place and day. Never throws: a failed live read becomes a labeled demo grid. */
export async function roomAvailability(p: StudyPlace, date: string): Promise<Availability> {
  if (!p.libcalId) return demoAvailability(p, date, "Demo data · this school's booking system needs a USC sign-in");
  const key = `${p.id}:${date}`;
  const hit = cache().days.get(key);
  if (hit && Date.now() - hit.at < HOUR) return hit.av;
  let av: Availability;
  try { av = await libcalDay(p, date); }
  catch (e) {
    console.warn(`[rooms] ${p.id} ${date}: ${(e as Error).message}; showing demo availability`);
    av = demoAvailability(p, date, "Demo availability · USC Libraries could not be reached");
  }
  cache().days.set(key, { at: Date.now(), av }); // failures are cached too, so a down LibCal is not hammered
  return av;
}
