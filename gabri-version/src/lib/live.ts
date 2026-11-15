/**
 * Demo"live campus" simulator: every ~35s something happens (a friend posts a pickup game,
 * a hotspot surges, free food appears). Drives the live notification feed during the demo.
 */
import { BUILDING_BY_ID, INTERSECTIONS } from "./campus";
import { computeHotspots } from "./hotspots";
import { addNotification, canSee, db, getMe, newId } from "./store";
import type { CampusEvent } from "./types";

const TICK_MS = 35_000;
const MIN = 60_000;

function roundTo5(ms: number) {
  return Math.round(ms / (5 * MIN)) * 5 * MIN;
}

function addLiveEvent(e: Omit<CampusEvent, "id" |"createdAt" |"moderation" |"source">) {
  const ev: CampusEvent = {
    ...e,
    id: newId("ev"),
    createdAt: new Date().toISOString(),
    source: "user",
    moderation: { status: "approved", reasons: [], riskScore: 0.02, checkedBy: "claude" },
  };
  db().events.push(ev);
  return ev;
}

const SCRIPT: (() => void)[] = [
  () => {
    const at = INTERSECTIONS.find((i) => i.id === "hoover_jefferson")!;
    const now = Date.now();
    const alert = {
      id: newId("al"), kind: "police_activity" as const, severity: "medium" as const, title: "Police activity", advice: "Expect delays on Hoover St",
      locationText: at.name, lat: at.lat, lng: at.lng, radiusM: 70, createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 45 * MIN).toISOString(), source: "dps" as const, resolved: false,
    };
    db().alerts.push(alert);
    addNotification({ kind: "safety", title: "DPS: Police activity", body: `${at.name} · ${alert.advice}`, alertId: alert.id, source: "live" });
  },
  () => {
    const now = Date.now();
    const ev = addLiveEvent({
      title: "Spikeball on the Quad", description: "Have 2 sets, need players. Drop in anytime.", category: "sports_play", buildingId: "mcq",
      start: new Date(roundTo5(now + 15 * MIN)).toISOString(), end: new Date(roundTo5(now + 75 * MIN)).toISOString(),
      host: { kind: "user", name: "Ethan Brooks", id: "u_ethan" }, visibility: "open", schools: ["all"], invitees: [], attendees: ["u_ethan", "anon_x1", "anon_x2"],
      capacity: 8, freeFood: false, tags: ["pickup"], expectedTurnout: 6,
    });
    addNotification({ kind: "friend", title: "Ethan started Spikeball on McCarthy Quad", body: "Open invite · starts in 15 min · 3 going", eventId: ev.id, buildingId: "mcq", source: "live" });
  },
  () => {
    const hs = computeHotspots(db().events).filter((h) => !h.suppressed).sort((a, b) => b.ratio - a.ratio)[0];
    if (!hs) return;
    const b = BUILDING_BY_ID[hs.buildingId];
    addNotification({ kind: "hotspot", title: `${b.name} is busier than usual`, body: `${hs.ratio.toFixed(1)}x its normal crowd right now`, buildingId: b.id, source: "live" });
  },
  () => {
    const ev = db().events.find((e) => e.title.startsWith("Boba study break"));
    if (ev && !ev.attendees.includes("u_jordan")) ev.attendees.push("u_jordan");
    addNotification({ kind: "friend", title: "Jordan is going to Boba study break", body: "Maya and Jordan are going · TCC · free boba", eventId: ev?.id, source: "live" });
  },
  () => {
    const now = Date.now();
    const ev = addLiveEvent({
      title: "Leftover tacos from Latinx Business Assoc.", description: "Event ended early, ~40 taco plates left. Come grab one!", category: "student", buildingId: "jkp",
      start: new Date(roundTo5(now)).toISOString(), end: new Date(roundTo5(now + 30 * MIN)).toISOString(),
      host: { kind: "org", name: "Latinx Business Association" }, visibility: "public", schools: ["all"], invitees: [], attendees: [],
      freeFood: true, foodDetail: "Free tacos (~40 left)", tags: ["leftovers"], expectedTurnout: 40,
    });
    addNotification({ kind: "food", title: "Free tacos at Popovich Hall", body: "~40 plates left · next 30 min", eventId: ev.id, buildingId: "jkp", source: "live" });
  },
  () => {
    const me = getMe();
    const quiet = computeHotspots(db().events).filter((h) => BUILDING_BY_ID[h.buildingId].studySpot && h.level === "quiet")[0];
    addNotification({
      kind: "system", title: "Quiet study spot nearby",
      body: quiet ? `${BUILDING_BY_ID[quiet.buildingId].name} is quiet right now` : "Libraries are calm right now",
      buildingId: quiet?.buildingId, source: "live",
    });
  },
];

/** Called on every notifications poll; advances the script at most once per TICK. */
export function tickLive() {
  const d = db();
  const now = Date.now();
  if (now - d.lastLiveTick < TICK_MS) return;
  d.lastLiveTick = now;
  if (d.liveScriptIndex >= SCRIPT.length) return;
  SCRIPT[d.liveScriptIndex++]();
}

/**
 * Heads-up before it's too late: once per event, for things in the next 3 days you haven't joined that are
 * nearly full or need a ticket / registration. At most one every 2 minutes, so the feed never floods.
 */
export function remindSignups(now = Date.now()) {
  const d = db();
  if (now - d.lastReminder < 2 * 60_000) return; // at most one heads-up every 2 minutes
  const me = getMe();
  const done = new Set(d.reminded);
  const e = d.events
    .filter((x) => !done.has(x.id) && !x.game && canSee(x, me) && x.visibility !== "invite" && !x.attendees.includes(me.id))
    .filter((x) => { const t = +new Date(x.start); return t > now + 60 * MIN && t < now + 72 * 60 * MIN; })
    .find((x) => !!x.link || (x.capacity != null && x.capacity - x.attendees.length <= Math.max(5, x.capacity * 0.25)));
  if (!e) return;
  d.reminded.push(e.id);
  d.lastReminder = now;
  const when = new Date(e.start).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });
  const where = BUILDING_BY_ID[e.buildingId]?.name ?? "";
  const left = e.capacity != null ? e.capacity - e.attendees.length : null;
  addNotification({
    kind: "event",
    title: e.link ? `${e.link.label}: ${e.title}` : `Filling up: ${e.title}`,
    body: `${left != null && !e.link ? `${left} spots left · ` : ""}${when} · ${where}`,
    eventId: e.id, source: "live",
  });
}
