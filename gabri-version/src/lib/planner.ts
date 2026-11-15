/** Deterministic context the AI reasons over: free time, nearby options, study spots. */
import { BUILDING_BY_ID, BUILDINGS, CATEGORY_META, walkMinutes } from "./campus";
import { computeHotspots } from "./hotspots";
import { canSee, db, publicEvent } from "./store";
import type { ClassMeeting, Hotspot, User } from "./types";

export interface Loc { lat: number; lng: number; label: string }

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export function todaysClasses(user: User, now: Date) {
  const day = now.getDay();
  const out: { kind: "class" | "office_hours"; code: string; title: string; buildingId: string; room: string; start: Date; end: Date }[] = [];
  const mk = (hhmm: string) => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setMinutes(toMin(hhmm));
    return d;
  };
  for (const c of user.classes) {
    if (c.days.includes(day)) out.push({ kind: "class", code: c.code, title: c.title, buildingId: c.buildingId, room: c.room, start: mk(c.start), end: mk(c.end) });
    const oh = c.officeHours;
    if (oh && oh.days.includes(day))
      out.push({ kind: "office_hours", code: c.code, title: `${c.code} office hours (${oh.who})`, buildingId: oh.buildingId, room: oh.room, start: mk(oh.start), end: mk(oh.end) });
  }
  return out.sort((a, b) => +a.start - +b.start);
}

export function nextCommitment(user: User, now: Date) {
  return todaysClasses(user, now).find((c) => c.kind === "class" && +c.end > +now);
}

export function freeWindow(user: User, now: Date) {
  const next = nextCommitment(user, now);
  if (!next) return { minutes: 240, until: null as Date | null, next: null as ReturnType<typeof nextCommitment> | null };
  if (+next.start <= +now) return { minutes: 0, until: next.end, next };
  return { minutes: Math.round((+next.start - +now) / 60_000), until: next.start, next };
}

export function hotspotLabel(h: Hotspot) {
  if (h.suppressed) return "very quiet";
  const pct = Math.round((h.ratio - 1) * 100);
  return `${h.level}${Math.abs(pct) >= 15 ? ` (${pct > 0 ? "+" : ""}${pct}% vs usual)` : ""}`;
}

export function studySpots(loc: Loc, now = new Date()) {
  const hs = computeHotspots(db().events, now);
  return BUILDINGS.filter((b) => b.studySpot)
    .map((b) => {
      const h = hs.find((x) => x.buildingId === b.id)!;
      const fill = h.count / b.capacity;
      const walk = walkMinutes(loc, b);
      // lower is better: emptier, closer, quiet bonus
      const score = fill * 100 + walk * 2.5 - (b.studySpot!.quiet ? 8 : 0) + (h.trend === "rising" ? 6 : 0);
      return { building: b, hotspot: h, walk, fill: Math.round(fill * 100), score };
    })
    .sort((a, b) => a.score - b.score);
}

export function candidateEvents(user: User, loc: Loc, now = new Date(), horizonMin = 300) {
  const hs = computeHotspots(db().events, now);
  return db()
    .events.filter((e) => canSee(e, user))
    .filter((e) => +new Date(e.end) > +now && +new Date(e.start) < +now + horizonMin * 60_000)
    .map((e) => {
      const pe = publicEvent(e, user);
      const b = BUILDING_BY_ID[e.buildingId];
      const h = hs.find((x) => x.buildingId === e.buildingId);
      return {
        ...pe,
        walkMin: walkMinutes(loc, b),
        startsInMin: Math.round((+new Date(e.start) - +now) / 60_000),
        live: +new Date(e.start) <= +now,
        crowd: h ? hotspotLabel(h) : "unknown",
      };
    });
}

/** Non-AI fallback ranking (also used to pre-sort candidates for Claude). */
export function heuristicRank(user: User, cands: ReturnType<typeof candidateEvents>, freeMin: number) {
  return cands
    .map((c) => {
      let s = 0;
      if (c.going) s += 30;
      s += c.friendsGoing.length * 12;
      if (c.isClassmate) s += 18;
      if (c.freeFood) s += 10;
      if (c.invited) s += 15;
      if (user.interests.some((i) => (c.title + c.tags.join(" ") + c.description).toLowerCase().includes(i.toLowerCase()))) s += 14;
      if (c.live) s += 8;
      s -= c.walkMin * 1.2;
      const fits = c.startsInMin + c.walkMin <= freeMin || freeMin >= 240;
      if (!fits) s -= 40;
      if (c.startsInMin > 120) s -= 10;
      return { c, s };
    })
    .sort((a, b) => b.s - a.s)
    .map((x) => x.c);
}

export function describeClass(c: ClassMeeting) {
  return `${c.code} ${c.title} @ ${c.room}`;
}

export const catLabel = (c: string) => CATEGORY_META[c]?.label ?? c;
