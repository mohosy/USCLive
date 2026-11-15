/** Walking route + path math shared by the 3D (Google tiles) tour. Mirrors Mo's WalkGuide route logic. */
import { BUILDINGS, distanceMeters } from "./campus";

export type LL = { lng: number; lat: number };
export type Step = { instruction: string; startM: number; distance: number };

export async function fetchWalkRoute(from: LL, to: LL & { name: string }, token: string): Promise<{ pts: LL[]; steps: Step[]; fallback: boolean }> {
  try {
    const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${from.lng},${from.lat};${to.lng},${to.lat}?geometries=geojson&overview=full&steps=true&access_token=${token}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Directions ${r.status}`);
    const d = await r.json();
    const route = d.routes?.[0];
    if (!route) throw new Error("No route");
    const pts: LL[] = route.geometry.coordinates.map(([lng, lat]: [number, number]) => ({ lng, lat }));
    const steps: Step[] = [];
    let acc = 0;
    for (const s of route.legs?.[0]?.steps ?? []) {
      if (s.distance >= 8 || steps.length === 0) steps.push({ instruction: s.maneuver.instruction, startM: acc, distance: s.distance });
      acc += s.distance;
    }
    return { pts, steps, fallback: false };
  } catch {
    return { pts: [from, to], steps: [{ instruction: `Head toward ${to.name}`, startM: 0, distance: distanceMeters(from, to) }], fallback: true };
  }
}

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

export function bearing(a: LL, b: LL) {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Polyline with cumulative distances, for "where am I after N meters". */
export class Path {
  cum: number[] = [0];
  length: number;
  constructor(public pts: LL[]) {
    for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + distanceMeters(pts[i - 1], pts[i]));
    this.length = this.cum[this.cum.length - 1];
  }
  at(m: number): LL & { i: number } {
    const d = Math.max(0, Math.min(this.length, m));
    let i = 1;
    while (i < this.cum.length - 1 && this.cum[i] < d) i++;
    const seg = this.cum[i] - this.cum[i - 1] || 1;
    const t = (d - this.cum[i - 1]) / seg;
    const a = this.pts[i - 1], b = this.pts[i];
    return { lng: a.lng + (b.lng - a.lng) * t, lat: a.lat + (b.lat - a.lat) * t, i };
  }
  /** points from 0 to m (for drawing the walked part) */
  until(m: number): LL[] {
    const p = this.at(m);
    return [...this.pts.slice(0, p.i), { lng: p.lng, lat: p.lat }];
  }
  /** buildings you pass along the way (within ~55 m of the path) */
  landmarks(excludeId: string): { name: string; atM: number }[] {
    const out: { name: string; atM: number }[] = [];
    for (const b of BUILDINGS) {
      if (b.id === excludeId || b.minor) continue;
      let best = { off: Infinity, along: 0 };
      for (let m = 0; m <= this.length; m += 10) {
        const off = distanceMeters(this.at(m), b);
        if (off < best.off) best = { off, along: m };
      }
      if (best.off < 55 && best.along > 40 && best.along < this.length - 40) out.push({ name: b.name, atM: best.along });
    }
    return out.sort((a, b) => a.atM - b.atM);
  }
}
