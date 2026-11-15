/**
 * How "you" move on the map. The browser reports a new location now and then; your Trojan walks there
 * instead of jumping, turns to face the way it is going, and stands facing your compass heading (when the
 * phone gives one) once it stops. Both map views (Explore and Satellite) run this same logic.
 * No imports, so it can be checked on its own (scripts/check-me-motion.mjs).
 */
export type LL = { lat: number; lng: number };

/** smaller moves than this are location jitter: stay put */
export const JITTER_M = 2;
/** further than this is not a walk (location switched on, or a jump across town): appear there */
export const TELEPORT_M = 400;
const MIN_WALK_S = 0.9;
const MAX_WALK_S = 4.5;
const WALK_MPS = 5; // on-screen pace for short hops; long hops are capped at MAX_WALK_S
const TURN_DPS = 300;

const rad = (d: number) => (d * Math.PI) / 180;

export function metersBetween(a: LL, b: LL) {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** compass bearing from a to b: 0 north, 90 east */
export function bearingBetween(a: LL, b: LL) {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const norm = (d: number) => ((d % 360) + 360) % 360;
/** shortest signed turn from one heading to another, in degrees (-180..180) */
export const turnBetween = (from: number, to: number) => ((norm(to) - norm(from) + 540) % 360) - 180;

export class MeMotion {
  pos: LL;
  /** where the Trojan faces now, compass degrees */
  heading: number;
  moving = false;
  /** false until a walk or a compass reading has set the heading (the view may face it to the camera until then) */
  hasHeading = false;
  private from: LL;
  private to: LL;
  private t0 = 0;
  private dur = 0;
  private want: number;
  private compass: number | null = null;
  private last = 0;

  constructor(start: LL, heading = 0) {
    this.pos = { ...start };
    this.from = { ...start };
    this.to = { ...start };
    this.heading = this.want = norm(heading);
  }

  /** A new location. `instant` (reduced motion, or the marker is not on screen) skips the walk. */
  setTarget(to: LL, now: number, instant = false) {
    const d = metersBetween(this.pos, to);
    if (d < JITTER_M && !this.moving) return;
    if (instant || d > TELEPORT_M) {
      this.pos = { ...to }; this.from = { ...to }; this.to = { ...to };
      this.moving = false;
      return;
    }
    if (this.moving && metersBetween(this.to, to) < JITTER_M) return; // already walking there
    this.from = { ...this.pos };
    this.to = { ...to };
    this.t0 = now;
    this.dur = Math.min(MAX_WALK_S, Math.max(MIN_WALK_S, d / WALK_MPS)) * 1000;
    this.moving = true;
    this.want = bearingBetween(this.from, this.to);
    this.hasHeading = true;
  }

  /** The phone's compass heading (null when there is none). Used while standing still. */
  setCompass(deg: number | null) {
    this.compass = deg == null || !Number.isFinite(deg) ? null : norm(deg);
    if (this.compass != null) this.hasHeading = true;
  }

  /** Until a walk or the compass says otherwise, face this way (the views pass "toward the camera"). */
  setFallbackHeading(deg: number) {
    if (!this.hasHeading) this.heading = this.want = norm(deg);
  }

  /** Advance to `now` (ms). Returns true while the Trojan is still walking or turning. */
  step(now: number): boolean {
    const dt = this.last ? Math.min(0.1, Math.max(0, (now - this.last) / 1000)) : 0;
    this.last = now;
    if (this.moving) {
      const k = this.dur <= 0 ? 1 : Math.min(1, (now - this.t0) / this.dur);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2; // ease in and out
      this.pos = { lat: this.from.lat + (this.to.lat - this.from.lat) * e, lng: this.from.lng + (this.to.lng - this.from.lng) * e };
      if (k >= 1) { this.moving = false; this.pos = { ...this.to }; }
    }
    if (!this.moving && this.compass != null) this.want = this.compass;
    const turn = turnBetween(this.heading, this.want);
    const max = TURN_DPS * dt;
    this.heading = norm(Math.abs(turn) <= max ? this.want : this.heading + Math.sign(turn) * max);
    return this.moving || Math.abs(turnBetween(this.heading, this.want)) > 0.5;
  }
}
