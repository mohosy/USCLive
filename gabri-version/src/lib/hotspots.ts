/**
 * Hotspots = aggregated, anonymized presence per building compared with that building's
 * normal level for this hour. In production the counts would come from opt-in, anonymous
 * check-ins (or Wi-Fi AP association counts from ITS), aggregated server-side.
 * Buildings with fewer than K people are suppressed so nobody can be singled out.
 * In this MVP the counts are simulated deterministically.
 */
import { CORE_BUILDINGS } from "./campus";
import type { Building, BuildingKind, CampusEvent, Hotspot } from "./types";

export const K_ANON = 5;

// Fraction of capacity that is "normal" at each hour (0-23), by building kind.
const CURVES: Record<BuildingKind, number[]> = {
  library:        [.25,.18,.1,.05,.03,.03,.05,.1,.25,.4,.5,.55,.55,.6,.65,.7,.7,.7,.75,.8,.85,.8,.65,.45],
  classroom:      [.02,.01,0,0,0,0,.02,.1,.45,.7,.75,.7,.6,.7,.75,.7,.55,.4,.3,.25,.2,.12,.06,.03],
  dining:         [.05,.02,0,0,0,0,.05,.3,.45,.3,.25,.6,.9,.75,.35,.25,.3,.6,.85,.75,.45,.3,.2,.1],
  gym:            [.05,0,0,0,0,.05,.3,.45,.4,.3,.3,.35,.45,.4,.4,.55,.75,.85,.8,.7,.55,.4,.2,.08],
  field:          [0,0,0,0,0,0,.1,.2,.15,.1,.1,.15,.2,.2,.3,.45,.6,.7,.65,.5,.35,.2,.05,0],
  student_center: [.05,.02,0,0,0,0,.05,.2,.4,.5,.6,.8,.9,.8,.6,.55,.55,.6,.55,.45,.35,.25,.15,.08],
  housing:        [.6,.5,.4,.4,.4,.4,.45,.5,.4,.3,.25,.25,.3,.3,.3,.35,.4,.5,.55,.6,.65,.7,.7,.65],
  arena:          [0,0,0,0,0,0,0,.02,.05,.05,.05,.05,.05,.05,.05,.05,.08,.1,.15,.15,.12,.05,.02,0],
  parking:        [.1,.05,.02,.02,.02,.05,.2,.5,.8,.9,.9,.85,.8,.8,.75,.7,.6,.45,.3,.2,.15,.12,.1,.1],
  outdoor:        [.02,.01,0,0,0,0,.05,.2,.4,.45,.6,.75,.85,.7,.6,.55,.5,.45,.35,.25,.15,.1,.05,.03],
};

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

function interp(curve: number[], d: Date) {
  const h = d.getHours() + d.getMinutes() / 60;
  const a = Math.floor(h) % 24;
  const b = (a + 1) % 24;
  const t = h - Math.floor(h);
  return curve[a] * (1 - t) + curve[b] * t;
}

export function baselineAt(b: Building, d: Date) {
  // weekends are ~60% as busy for academic buildings
  const weekend = d.getDay() === 0 || d.getDay() === 6;
  const factor = weekend && (b.kind === "classroom" || b.kind === "library") ? 0.6 : 1;
  return Math.max(1, Math.round(b.capacity * interp(CURVES[b.kind], d) * factor));
}

/** What a live event adds to a building: server events carry the attendee list, the browser's public copies carry a count. */
export interface BoostEvent { id: string; buildingId: string; start: string; end: string; attendees?: string[]; attendeeCount?: number; moderation?: { status: string } }

function liveEventBoost(b: Building, d: Date, events: BoostEvent[]) {
  let boost = 0;
  for (const e of events) {
    if (e.buildingId !== b.id || (e.moderation && e.moderation.status !== "approved")) continue;
    const s = +new Date(e.start), en = +new Date(e.end), t = +d;
    if (t < s - 15 * 60_000 || t > en) continue;
    // ramp up in the 15 min before start
    const ramp = t < s ? 1 - (s - t) / (15 * 60_000) : 1;
    boost += (e.attendees?.length ?? e.attendeeCount ?? 0) * (0.55 + hash(e.id) * 0.45) * ramp; // not every RSVP shows up
  }
  return boost;
}

export function countAt(b: Building, d: Date, events: BoostEvent[]) {
  const base = baselineAt(b, d);
  const bucket = Math.floor(+d / (5 * 60_000));
  const noise = 0.85 + hash(`${b.id}:${bucket}`) * 0.3; // ±15%
  // a few buildings run hotter than usual today, to make the demo interesting
  const todaySkew = 0.9 + hash(`${b.id}:${d.toDateString()}`) * 0.5;
  return Math.max(0, Math.round(base * noise * todaySkew + liveEventBoost(b, d, events)));
}

/** How full a place is: the whole percentage shown everywhere (people ÷ capacity, capped at 99). */
export const fillPct = (count: number, capacity: number) => Math.min(99, Math.max(0, Math.round((count / Math.max(1, capacity)) * 100)));

/**
 * The one busyness scale. Every Quiet / Normal / Busy / Packed label in the app (map markers, event tags, panels,
 * the assistant) comes from the percentage full, so a label and the number next to it can never disagree:
 * under 30% Quiet, 30-59% Normal, 60-84% Busy, 85% and up Packed.
 * How it compares with the usual crowd at this hour is a separate fact (`ratio`, shown as "1.4x usual").
 */
export const LEVEL_FROM_PCT = { normal: 30, busy: 60, packed: 85 } as const;
export function levelForPct(pct: number): Hotspot["level"] {
  return pct >= LEVEL_FROM_PCT.packed ? "packed" : pct >= LEVEL_FROM_PCT.busy ? "busy" : pct >= LEVEL_FROM_PCT.normal ? "normal" : "quiet";
}

/** How busy one building is right now. Works for every building (the map and the detail panel use this same math). */
export function hotspotFor(b: Building, events: BoostEvent[], now = new Date()): Hotspot {
  const count = countAt(b, now, events);
  const prev = countAt(b, new Date(+now - 15 * 60_000), events);
  const baseline = baselineAt(b, now);
  const ratio = +(count / baseline).toFixed(2);
  const delta = count - prev;
  return {
    buildingId: b.id,
    count,
    baseline,
    ratio,
    level: levelForPct(fillPct(count, b.capacity)),
    trend: delta > b.capacity * 0.04 ? "rising" : delta < -b.capacity * 0.04 ? "falling" : "steady",
    suppressed: count < K_ANON,
  };
}

/** The main buildings, tracked continuously (crowds, heat, callouts). Smaller buildings use hotspotFor on demand. */
export function computeHotspots(events: CampusEvent[], now = new Date()): Hotspot[] {
  return CORE_BUILDINGS.map((b) => hotspotFor(b, events, now));
}

/** One line for a hover: "About 120 people · busy · 1.4x usual". */
export function busyLine(h: Hotspot): string {
  return h.suppressed ? "Very quiet · fewer than 5 people" : `About ${h.count} people · ${h.level} · ${h.ratio.toFixed(1)}x usual`;
}

/** 24-hour "popular times" curve for a building: typical vs today. */
export function dayCurve(b: Building, events: BoostEvent[], now = new Date()) {
  return Array.from({ length: 24 }, (_, h) => {
    const d = new Date(now);
    d.setHours(h, 0, 0, 0);
    return { hour: h, typical: baselineAt(b, d), today: h <= now.getHours() ? countAt(b, d, events) : null };
  });
}
