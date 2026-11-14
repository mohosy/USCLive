/**
 * Demo"live campus" simulator: every ~35s something happens (a friend posts a pickup game,
 * a hotspot surges, free food appears). Drives the live notification feed during the demo.
 */
import { BUILDING_BY_ID } from "./campus";
import { computeHotspots } from "./hotspots";
import { addNotification, db, getMe, newId } from "./store";
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
    const now = Date.now();
    const ev = addLiveEvent({
      title: "Spikeball on the Quad", description: "Have 2 sets, need players. Drop in anytime.", category: "sports", buildingId: "mcq",
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
      title: "Leftover tacos from Latinx Business Assoc.", description: "Event ended early, ~40 taco plates left. Come grab one!", category: "social", buildingId: "jkp",
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
