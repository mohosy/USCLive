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

/** "Open in" from Settings: which map view the app starts in. Kept in this browser too, so the map knows before the account loads. */
const OPEN_KEY = "usclive.openIn";
export function loadOpenIn(): "explore" | "satellite" {
  try { return localStorage.getItem(OPEN_KEY) === "satellite" ? "satellite" : "explore"; } catch { return "explore"; }
}
export function saveOpenIn(v: "explore" | "satellite") {
  try { localStorage.setItem(OPEN_KEY, v); } catch { /* storage blocked */ }
}

/** "Show people on the map" from Settings: the little Trojans standing at busy spots. On unless turned off. */
const PEOPLE_KEY = "usclive.people";
export function loadShowPeople(): boolean {
  try { return localStorage.getItem(PEOPLE_KEY) !== "off"; } catch { return true; }
}
export function saveShowPeople(on: boolean) {
  try { localStorage.setItem(PEOPLE_KEY, on ? "on" : "off"); } catch { /* storage blocked */ }
}
