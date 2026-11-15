/**
 * Schedule conflicts: does an event clash with your classes or with events you are already going to?
 * Two kinds: an overlap in time, and a "tight connection" where the walk between the two buildings takes
 * longer than the gap between them. No runtime imports, so the rules can be checked on their own
 * (scripts/check-conflicts.mjs); the server supplies your schedule and the walking times.
 */

/** Something already on your schedule. */
export interface Busy {
  kind: "class" | "event";
  id: string;
  /** what to call it: "FBE 403", "Boba study break" */
  label: string;
  start: string;
  end: string;
  buildingId?: string;
  /** where, for the message: "JKP 112" */
  place?: string;
}
export interface Conflict {
  type: "overlap" | "tight";
  with: { kind: Busy["kind"]; id: string; label: string };
  /** the full sentence: "Conflicts with FBE 403, 2:00-3:20 PM, JKP 112" */
  text: string;
  /** the short mark for your schedule and the event card: "Overlaps FBE 403" */
  short: string;
  /** tight connections: minutes between the two, and minutes it takes to walk */
  gapMin?: number;
  walkMin?: number;
}

const MIN = 60_000;
/** a gap longer than this is never a tight connection, however far the walk */
const TIGHT_WINDOW_MIN = 45;

const hm = (d: Date) => `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")}`;
const ap = (d: Date) => (d.getHours() < 12 ? "AM" : "PM");
/** "2:00-3:20 PM", "11:30 AM-1:00 PM" */
export function timeRange(startIso: string, endIso: string) {
  const s = new Date(startIso), e = new Date(endIso);
  return ap(s) === ap(e) ? `${hm(s)}-${hm(e)} ${ap(e)}` : `${hm(s)} ${ap(s)}-${hm(e)} ${ap(e)}`;
}

/**
 * Everything on `busy` that clashes with `ev`, overlaps first, then tight connections, each in time order.
 * `walkMin(a, b)` is the walk between two buildings in minutes (null when unknown: then no tight-connection check).
 */
export function findConflicts(
  ev: { id: string; start: string; end: string; buildingId?: string },
  busy: Busy[],
  walkMin: (fromBuildingId: string, toBuildingId: string) => number | null,
): Conflict[] {
  const s = +new Date(ev.start), e = +new Date(ev.end);
  const out: Conflict[] = [];
  for (const b of [...busy].sort((x, y) => +new Date(x.start) - +new Date(y.start))) {
    if (b.kind === "event" && b.id === ev.id) continue;
    const bs = +new Date(b.start), be = +new Date(b.end);
    const who = { kind: b.kind, id: b.id, label: b.label };
    if (s < be && bs < e) {
      out.push({ type: "overlap", with: who, text: `Conflicts with ${b.label}, ${timeRange(b.start, b.end)}${b.place ? `, ${b.place}` : ""}`, short: `Overlaps ${b.label}` });
      continue;
    }
    if (!ev.buildingId || !b.buildingId || ev.buildingId === b.buildingId) continue;
    // back to back: is there time to walk from one to the other?
    const after = s >= be; // this event comes after the busy one
    const gap = Math.round((after ? s - be : bs - e) / MIN);
    if (gap < 0 || gap > TIGHT_WINDOW_MIN) continue;
    const walk = after ? walkMin(b.buildingId, ev.buildingId) : walkMin(ev.buildingId, b.buildingId);
    if (walk == null || walk <= gap) continue;
    out.push({
      type: "tight", with: who, gapMin: gap, walkMin: walk,
      text: after
        ? `Starts ${gap === 0 ? "right when" : `${gap} min after`} ${b.label} ends, ${walk} min walk`
        : `Ends ${gap === 0 ? "right when" : `${gap} min before`} ${b.label} starts, ${walk} min walk`,
      short: `Tight ${after ? "after" : "before"} ${b.label}`,
    });
  }
  return out.sort((x, y) => (x.type === y.type ? 0 : x.type === "overlap" ? -1 : 1));
}

/** The one mark for an event on your schedule: the first overlap, else the first tight connection, with "+N" when there are more. */
export function conflictMark(conflicts: Conflict[]): string | null {
  if (!conflicts.length) return null;
  return conflicts.length === 1 ? conflicts[0].short : `${conflicts[0].short} +${conflicts.length - 1}`;
}

/**
 * What a sign-up does with the conflicts it found: with none it goes straight through; with some it stops and
 * asks, unless the person already said "Register anyway".
 */
export function conflictDecision(conflicts: Conflict[], anyway: boolean): "go" | "ask" {
  return conflicts.length === 0 || anyway ? "go" : "ask";
}
