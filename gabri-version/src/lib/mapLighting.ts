/** The "Map lighting" choice from Settings: follow the real sun over campus (Auto) or hold one time of day. Saved in this browser. */
import type { LightPreset } from "./sun";

export type MapLighting = LightPreset | "auto";
export const MAP_LIGHTINGS: MapLighting[] = ["auto", "dawn", "day", "dusk", "night"];
const KEY = "usclive.mapLighting";

export function loadMapLighting(): MapLighting {
  try {
    const v = localStorage.getItem(KEY) as MapLighting | null;
    return v && MAP_LIGHTINGS.includes(v) ? v : "auto";
  } catch { return "auto"; } // storage blocked
}
export function saveMapLighting(v: MapLighting) {
  try { localStorage.setItem(KEY, v); } catch { /* storage blocked: the choice lasts until the page reloads */ }
}
