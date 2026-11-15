/** Keeps map bubbles from overlapping: when two collide, the more important one stays and the other is hidden. */
import type { CalloutKind } from "./callouts";

/** Live game > DPS > busy > events > schedule > the small tags. */
const RANK: Record<CalloutKind, number> = { game: 7, alert: 6, busy: 5, quiet: 4, event: 3, schedule: 2, alertmini: 1, webcam: 0 };

export interface PlacedBubble { el: HTMLElement; kind: CalloutKind; /** screen position of the bubble's tail tip */ x: number; y: number }

const sizes = new WeakMap<HTMLElement, { text: string; w: number; h: number }>();
/** Bubble size, re-measured only when its text changes (reading layout on every frame would be slow). */
function sizeOf(el: HTMLElement) {
  const text = el.textContent ?? "";
  let s = sizes.get(el);
  if (!s || s.text !== text) { s = { text, w: el.offsetWidth, h: el.offsetHeight }; sizes.set(el, s); }
  return s;
}

export function declutter(items: PlacedBubble[]) {
  const taken: [number, number, number, number][] = [];
  for (const it of [...items].sort((a, b) => RANK[b.kind] - RANK[a.kind])) {
    const { w, h } = sizeOf(it.el);
    const box: [number, number, number, number] = [it.x - w / 2, it.y - h, it.x + w / 2, it.y];
    const hit = taken.some((t) => box[0] < t[2] + 4 && box[2] > t[0] - 4 && box[1] < t[3] + 4 && box[3] > t[1] - 4);
    it.el.classList.toggle("co-hidden", hit);
    if (!hit) taken.push(box);
  }
}
