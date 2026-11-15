/**
 * Map callouts ("bubbles"): the handful of things worth reading at a glance.
 * Built on the client from app state; the map only draws them.
 */
import { BUILDING_BY_ID, CATEGORY_META } from "./campus";
import { fmtTime, isLive, type AppState } from "./client-types";
import type { GameInfo } from "./types";
import { WEBCAMS } from "./webcams";
import { eventPhoto } from "./eventPhotos";

export type CalloutKind = "game" | "busy" | "quiet" | "event" | "schedule" | "alert" | "alertmini" | "webcam";

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
  /** webcams: compass direction the camera looks */
  heading?: number;
  /** webcams: latest still from the camera (refreshed by the map every minute) */
  image?: string;
  /** events with free food: what's offered (shown as a small badge, whatever the filters are) */
  food?: string;
  /** DPS alerts: how serious (sets the tag color) */
  severity?: "high" | "medium" | "low";
  /** your classes / office hours: the mini ticket and its hover card */
  sched?: { kind: "class" | "office_hours"; code: string; room: string; place: string; when: string; whenShort: string; live: boolean };
  /** events: what the small photo ring and its hover card show */
  ev?: {
    photo?: string; color: string; full: string; place: string;
    when: string; whenShort: string; state: "live" | "soon";
    going: number; friends: { initials: string; name: string; photo?: string }[];
  };
}

/** The one filter row on the map. Each chip adds a layer; none hides another (Free food adds food highlights, it never hides sports). */
export interface ChipState { games: boolean; events: boolean; food: boolean; crowds: boolean; safety: boolean; schedule: boolean; webcams: boolean }

const ago = (iso: string, now: Date) => {
  const m = Math.max(0, Math.round((+now - +new Date(iso)) / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 24 * 60) return `${Math.round(m / 60)} h ago`;
  return m < 48 * 60 ? "yesterday" : `${Math.floor(m / 1440)} days ago`;
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

  if (chips.crowds) {
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
      // crime-log entries: full bubble for serious or recent ones, a compact tag for the rest (every red circle gets a label)
      if (a.source === "dps_log" && a.severity !== "high" && +now - +new Date(a.createdAt) > 6 * 3600_000) {
        out.push({ id: `al:${a.id}`, kind: "alertmini", lng: a.lng, lat: a.lat, eyebrow: ago(a.createdAt, now), title: a.title, severity: a.severity });
        continue;
      }
      out.push({ id: `al:${a.id}`, kind: "alert", lng: a.lng, lat: a.lat, eyebrow: ago(a.createdAt, now), title: a.title, severity: a.severity });
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
        sched: (() => {
          const live = +new Date(c.start) <= +now;
          const mins = Math.max(1, Math.round((+new Date(c.start) - +now) / 60_000));
          return {
            kind: c.kind === "class" ? "class" as const : "office_hours" as const, code: c.code, room: c.room, place: bd.name, live,
            when: `${live ? "Now" : mins < 60 ? `In ${mins} min` : "Today"} · ${fmtTime(c.start)}–${fmtTime(c.end)}`,
            whenShort: live ? "Now" : mins < 60 ? `In ${mins} min` : fmtTime(c.start),
          };
        })(),
      });
    }
  }

  if (chips.events || chips.food) {
    const soon = s.events
      .filter((e) => !e.game && e.lat != null && e.lng != null && ((chips.events && (e.visibility === "open" || e.friendsGoing.length > 0)) || (chips.food && e.freeFood)))
      .filter((e) => +new Date(e.end) > +now && +new Date(e.start) - +now < 90 * 60_000)
      .sort((x, y) => y.friendsGoing.length - x.friendsGoing.length || +new Date(x.start) - +new Date(y.start))
      .slice(0, 7);
    for (const e of soon) {
      const where = b(e.buildingId)?.name ?? "";
      // the label is always the event's type; free food is a badge on top, so turning a filter on/off never renames an event
      const label = CATEGORY_META[e.category]?.label ?? "Event";
      out.push({
        id: `ev:${e.id}`, kind: "event", lng: e.lng!, lat: e.lat!, eyebrow: `${label} · ${where}`, food: e.freeFood ? e.foodDetail ?? "Free food" : undefined,
        title: e.title.length > 26 ? `${e.title.slice(0, 25)}…` : e.title,
        meta: `${isLive(e, now) ? "Now" : fmtTime(e.start)} · ${e.attendeeCount} going`,
        ev: (() => {
          const live = isLive(e, now);
          const mins = Math.max(1, Math.round((+new Date(e.start) - +now) / 60_000));
          return {
            photo: eventPhoto(e)?.src, color: CATEGORY_META[e.category]?.color ?? "#9333ea",
            full: e.title, place: e.room ? `${where} · ${e.room}` : where,
            when: live ? `Live now · until ${fmtTime(e.end)}` : mins < 60 ? `Starts in ${mins} min · ${fmtTime(e.start)}` : `Today · ${fmtTime(e.start)}`,
            whenShort: live ? "Live now" : mins < 60 ? `In ${mins} min` : fmtTime(e.start),
            state: live ? "live" as const : "soon" as const,
            going: e.attendeeCount,
            friends: e.friendsGoing.map((f) => ({ initials: f.avatar, name: f.name.split(" ")[0], photo: f.photo })),
          };
        })(),
      });
    }
  }

  if (chips.webcams) {
    for (const w of WEBCAMS) out.push({ id: `cam:${w.id}`, kind: "webcam", lng: w.lng, lat: w.lat, eyebrow: w.source, title: w.name, heading: w.heading, image: w.image });
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
