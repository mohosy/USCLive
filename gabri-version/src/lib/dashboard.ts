import { BUILDING_BY_ID } from "./campus";
import { countAt } from "./hotspots";
import { db, orgs } from "./store";
import type { CampusEvent } from "./types";

/**
 * Measured turnout = extra people in the building during the event vs. the building's normal
 * level for that hour (from anonymized aggregate presence). No individual tracking needed.
 */
function measuredTurnout(e: CampusEvent, now: Date) {
  const b = BUILDING_BY_ID[e.buildingId];
  const s = +new Date(e.start), en = +new Date(e.end);
  if (s > +now) return null;
  const t = new Date(Math.min(+now, s + (en - s) / 2));
  // crowd with this event minus the same moment without it = people this event drew
  const all = db().events;
  return Math.max(0, countAt(b, t, all) - countAt(b, t, all.filter((x) => x.id !== e.id)));
}

export function orgStats(orgId: string, now = new Date()) {
  const org = orgs().find((o) => o.id === orgId);
  if (!org) return null;
  const isUsg = org.kind === "usg";
  const events = db().events.filter((e) => (isUsg ? e.moderation.status === "approved" : e.host.id === orgId));
  const rows = events
    .map((e) => {
      const measured = measuredTurnout(e, now);
      return {
        id: e.id, title: e.title, start: e.start, end: e.end, building: BUILDING_BY_ID[e.buildingId]?.name, host: e.host.name,
        rsvps: e.attendees.length, capacity: e.capacity ?? null, expected: e.expectedTurnout ?? null, measured,
        showRate: measured != null && e.attendees.length ? Math.round((measured / e.attendees.length) * 100) : null,
        freeFood: e.freeFood, category: e.category, status: +new Date(e.end) < +now ? "past" : +new Date(e.start) <= +now ? "live" : "upcoming",
        source: e.source,
      };
    })
    .sort((a, b) => +new Date(a.start) - +new Date(b.start));

  const queue = db().events
    .filter((e) => e.moderation.status !== "approved")
    .map((e) => ({ id: e.id, title: e.title, description: e.description, host: e.host.name, building: BUILDING_BY_ID[e.buildingId]?.name, start: e.start, moderation: e.moderation }));

  const byCat: Record<string, number> = {};
  for (const e of events) byCat[e.category] = (byCat[e.category] ?? 0) + e.attendees.length;

  const withMeasured = rows.filter((r) => r.measured != null);
  return {
    org,
    isUsg,
    totals: {
      events: rows.length,
      rsvps: rows.reduce((s, r) => s + r.rsvps, 0),
      upcoming: rows.filter((r) => r.status === "upcoming").length,
      live: rows.filter((r) => r.status === "live").length,
      avgShowRate: withMeasured.length ? Math.round(withMeasured.reduce((s, r) => s + (r.showRate ?? 0), 0) / withMeasured.length) : null,
      foodEvents: rows.filter((r) => r.freeFood).length,
    },
    rows,
    byCategory: Object.entries(byCat).map(([category, rsvps]) => ({ category, rsvps })).sort((a, b) => b.rsvps - a.rsvps),
    queue: isUsg ? queue : queue.filter((q) => events.some((e) => e.id === q.id)),
  };
}
