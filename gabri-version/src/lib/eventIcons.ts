/**
 * Round map icons for each event type: colored disc, white glyph, white ring.
 * Drawn once on a canvas and handed to the maps as images (GPU sprites, no DOM per pin).
 * Variants: selected (cardinal ring) and free food (small amber badge).
 */
import { CATEGORY_META } from "./campus";
import { EVENT_ICON_PATHS } from "./eventIconPaths";

export const ICON_PX = 34; // on-screen size in CSS pixels
const RATIO = 2; // drawn at 2x for sharp edges on retina

export const iconKey = (category: string, selected: boolean, food: boolean) =>
  `ev-${EVENT_ICON_PATHS[category] ? category : "student"}${selected ? "-sel" : ""}${food ? "-food" : ""}`;

const cache = new Map<string, HTMLCanvasElement>();

export function iconCanvas(key: string): HTMLCanvasElement {
  const hit = cache.get(key);
  if (hit) return hit;
  const [, category] = key.match(/^ev-([a-z_]+?)(?:-sel)?(?:-food)?$/) ?? [];
  const selected = key.includes("-sel"), food = key.endsWith("-food");
  const size = ICON_PX * RATIO;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  g.scale(RATIO, RATIO);
  const mid = ICON_PX / 2, r = ICON_PX / 2 - 4;
  // soft drop shadow
  g.shadowColor = "rgba(0,0,0,0.28)"; g.shadowBlur = 4; g.shadowOffsetY = 1.5;
  g.beginPath(); g.arc(mid, mid, r, 0, Math.PI * 2);
  g.fillStyle = (CATEGORY_META[category] ?? CATEGORY_META.student).color; g.fill();
  g.shadowColor = "transparent";
  g.lineWidth = selected ? 3 : 2.25; g.strokeStyle = selected ? "#990000" : "#ffffff"; g.stroke();
  // glyph: 24x24 lucide paths scaled into the disc
  const s = (r * 1.1) / 24;
  g.save();
  g.translate(mid - 12 * s, mid - 12 * s); g.scale(s, s);
  g.strokeStyle = "#ffffff"; g.lineWidth = 2.2; g.lineCap = "round"; g.lineJoin = "round";
  for (const d of EVENT_ICON_PATHS[category] ?? EVENT_ICON_PATHS.student) g.stroke(new Path2D(d));
  g.restore();
  if (food) {
    g.beginPath(); g.arc(ICON_PX - 7, 7, 4.5, 0, Math.PI * 2);
    g.fillStyle = "#f59e0b"; g.fill(); g.lineWidth = 1.5; g.strokeStyle = "#fff"; g.stroke();
  }
  cache.set(key, c);
  return c;
}

/** every icon variant, for maps that need images registered up front (Mapbox) */
export function allIconKeys() {
  const out: string[] = [];
  for (const c of Object.keys(EVENT_ICON_PATHS)) for (const sel of [false, true]) for (const food of [false, true]) out.push(iconKey(c, sel, food));
  return out;
}
export const ICON_RATIO = RATIO;
