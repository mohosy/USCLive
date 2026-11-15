import { connection } from "next/server";
import { walkMinutes } from "@/lib/campus";
import { scheduleOn } from "@/lib/conflictCheck";
import { rateLimit } from "@/lib/rateLimit";
import { campusDate, campusHour, freeNow, groupFor, placeById, STUDY_PLACES, validDate } from "@/lib/studyRooms";
import { roomAvailability } from "@/lib/studyRoomsProvider";
import { db, getMe } from "@/lib/store";
import { withState } from "@/lib/state";

/**
 * Bookable study rooms. Read-only: USCLive shows what is free and links to the official booking page.
 *   GET /api/study/rooms?lat=&lng=                 -> every place: who can book it, how many rooms are free now, the walk
 *   GET /api/study/rooms?place=<id>&date=YYYY-MM-DD -> that place's rooms and hour-by-hour grid for the day, plus what is
 *                                                     on your schedule that day (for the conflict check)
 * Which rooms are "for you" comes from your account's school, never from the request.
 */
async function GET_(req: Request) {
  await connection();
  const me = getMe();
  const rl = rateLimit(`rooms:${me.id}`, 90, 60_000);
  if (!rl.ok) return Response.json({ error: `Too many requests. Try again in ${rl.retryAfterS} seconds.` }, { status: 429, headers: { "Retry-After": String(rl.retryAfterS) } });
  const sp = new URL(req.url).searchParams;
  const now = new Date();
  const today = campusDate(now);

  const placeId = sp.get("place");
  if (placeId) {
    const p = placeById(placeId);
    if (!p) return Response.json({ error: "No such place." }, { status: 404 });
    if (groupFor(p, me.school) === "locked") return Response.json({ error: "These rooms are for another school's students." }, { status: 403 });
    const date = sp.get("date") ?? today;
    // today and the next 6 days only
    const days = Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
    if (!validDate(date) || days < 0 || days > 6) return Response.json({ error: "Pick a day within the next week." }, { status: 400 });
    const av = await roomAvailability(p, date);
    return Response.json({
      place: { id: p.id, name: p.name, where: p.where, system: p.system, dailyLimitHours: p.dailyLimitHours, buildingId: p.buildingId ?? null, bookUrl: p.bookUrl, live: !!p.libcalId },
      availability: av, today, hourNow: campusHour(now),
      busy: scheduleOn(me, date, db().events),
    });
  }

  const lat = Number(sp.get("lat")), lng = Number(sp.get("lng"));
  const here = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat || lng) ? { lat, lng } : null;
  const hourNow = campusHour(now);
  const places = await Promise.all(STUDY_PLACES.map(async (p) => {
    const group = groupFor(p, me.school);
    const base = { id: p.id, name: p.name, letter: p.letter, where: p.where, school: p.school ?? null, group, rooms: p.demoRooms.length, walk: here ? walkMinutes(here, p) : null, dailyLimitHours: p.dailyLimitHours };
    if (group === "locked") return { ...base, free: null, untilHour: null, source: null };
    const av = await roomAvailability(p, today);
    return { ...base, rooms: av.rooms.length, ...freeNow(av, hourNow), source: av.source };
  }));
  return Response.json({ places, today, hourNow, school: me.school });
}

export const GET = withState(GET_);
