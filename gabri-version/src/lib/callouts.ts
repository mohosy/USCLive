/**
 * Map callouts ("bubbles"): the handful of things worth reading at a glance.
 * Built on the client from app state; the map only draws them.
 */
import { BUILDING_BY_ID } from "./campus";
import { fmtTime, isLive, type AppState } from "./client-types";
import type { GameInfo } from "./types";
import { WEBCAMS } from "./webcams";

export type CalloutKind = "game" | "busy" | "quiet" | "event" | "schedule" | "alert" | "webcam";

export interface Callout {
  id: string; // "ev:<id>" | "b:<buildingId>" | "al:<id>" | "cam:<id>"
  kind: CalloutKind;
  lng: number;
  lat: number;
  eyebrow: string;
  title: string;
  meta?: string;
  /** for live games: score/clock are computed every second by the map */
  game?: { info: GameInfo; start: string };
  /** busy/quiet ring intensity 0..1 */
  intensity?: number;
}

export interface ChipState { games: boolean; busy: boolean; safety: boolean; schedule: boolean; events: boolean; webcams: boolean }

const ago = (iso: string, now: Date) => {
  const m = Math.max(0, Math.round((+now - +new Date(iso)) / 60_000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

export function buildCallouts(s: AppState, chips: ChipState, now: Date): Callout[] {
  const out: Callout[] = [];
  const b = (id: string) => BUILDING_BY_ID[id];

  if (chips.games) {
    for (const e of s.events) {
      if (!e.game || !isLive(e, now) || e.lat == null || e.lng == null) continue;
      out.push({
        id: `ev:${e.id}`, kind: "game", lng: e.lng, lat: e.lat,
        eyebrow: `${e.game.sport} · ${b(e.buildingId)?.code === "COL" ? "Coliseum" : b(e.buildingId)?.name ?? ""}`,
        title: `${e.game.home} vs ${e.game.away}`, game: { info: e.game, start: e.start },
      });
    }
  }

  if (chips.busy) {
    const tracked = s.hotspots.filter((h) => !h.suppressed && b(h.buildingId) && ["dining", "gym", "library", "student_center"].includes(b(h.buildingId).kind));
    const fill = (h: (typeof tracked)[number]) => Math.min(99, Math.round((h.count / b(h.buildingId).capacity) * 100));
    const busiest = [...tracked].filter((h) => h.level === "busy" || h.level === "packed").sort((x, y) => fill(y) - fill(x)).slice(0, 3);
    const quietest = [...tracked].filter((h) => h.level === "quiet").sort((x, y) => fill(x) - fill(y)).slice(0, 1);
    for (const h of busiest) {
      const bd = b(h.buildingId);
      out.push({ id: `b:${bd.id}`, kind: "busy", lng: bd.lng, lat: bd.lat, eyebrow: bd.name, title: h.level === "packed" ? "Packed" : "Busy", meta: `${fill(h)}%`, intensity: Math.min(1, h.ratio / 2) });
    }
    for (const h of quietest) {
      const bd = b(h.buildingId);
      out.push({ id: `b:${bd.id}`, kind: "quiet", lng: bd.lng, lat: bd.lat, eyebrow: bd.name, title: "Quiet", meta: `${fill(h)}%` });
    }
  }

  if (chips.safety) {
    for (const a of s.alerts) {
      out.push({ id: `al:${a.id}`, kind: "alert", lng: a.lng, lat: a.lat, eyebrow: "DPS · Caution", title: a.title, meta: `${a.advice} · ${ago(a.createdAt, now)}` });
    }
  }

  if (chips.schedule) {
    for (const c of s.me.today) {
      if (+new Date(c.end) < +now) continue;
      const bd = b(c.buildingId);
      if (!bd) continue;
      const soon = +new Date(c.start) - +now < 3 * 3600_000;
      if (!soon) continue;
      out.push({
        id: `b:${bd.id}:${c.code}:${c.kind}`, kind: "schedule", lng: bd.lng, lat: bd.lat,
        eyebrow: `${c.kind === "class" ? "Class" : "Office hours"} · ${c.room}`, title: c.code, meta: `${fmtTime(c.start)}–${fmtTime(c.end)}`,
      });
    }
  }

  if (chips.events) {
    const soon = s.events
      .filter((e) => !e.game && e.lat != null && e.lng != null && (e.visibility === "open" || e.freeFood || e.friendsGoing.length > 0))
      .filter((e) => +new Date(e.end) > +now && +new Date(e.start) - +now < 90 * 60_000)
      .sort((x, y) => y.friendsGoing.length - x.friendsGoing.length || +new Date(x.start) - +new Date(y.start))
      .slice(0, 4);
    for (const e of soon) {
      const where = b(e.buildingId)?.name ?? "";
      const label = e.visibility === "open" ? "Pickup" : e.freeFood ? "Free food" : "Friends going";
      out.push({
        id: `ev:${e.id}`, kind: "event", lng: e.lng!, lat: e.lat!, eyebrow: `${label} · ${where}`,
        title: e.title.length > 26 ? `${e.title.slice(0, 25)}…` : e.title,
        meta: `${isLive(e, now) ? "Now" : fmtTime(e.start)} · ${e.attendeeCount} going`,
      });
    }
  }

  if (chips.webcams) {
    for (const w of WEBCAMS) out.push({ id: `cam:${w.id}`, kind: "webcam", lng: w.lng, lat: w.lat, eyebrow: w.source, title: w.name });
  }

  // one bubble per spot: later (more specific) kinds don't stack on top of earlier ones
  const seen = new Set<string>();
  return out.filter((c) => {
    const k = `${c.lng.toFixed(4)},${c.lat.toFixed(4)}`;
    if (seen.has(k) && c.kind !== "alert") return false;
    seen.add(k);
    return true;
  });
}
