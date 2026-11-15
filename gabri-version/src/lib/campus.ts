import type { Building, SchoolId } from "./types";
// Every other named building on/around campus, from OpenStreetMap (© OpenStreetMap contributors, ODbL)
import OSM_BUILDINGS from "./campus-buildings.osm.json";

/** USC University Park Campus. Coordinates come from Mapbox place search, so pins line up with the map's labels. */
export const USC_CENTER: [number, number] = [-118.2851, 34.0208]; // [lng, lat]

/** Core buildings: hand-tuned capacity/kind, used for crowds, study spots and the demo data. */
export const CORE_BUILDINGS: Building[] = [
  { id: "lvl", code: "LVL", name: "Leavey Library", lat: 34.021848, lng: -118.282864, kind: "library", capacity: 450,
    studySpot: { quiet: false, outlets: true, openLate: true, note: "24/7 during the semester, group rooms on the lower level" } },
  { id: "dml", code: "DML", name: "Doheny Memorial Library", lat: 34.020216, lng: -118.283729, kind: "library", capacity: 350,
    studySpot: { quiet: true, outlets: false, openLate: false, note: "Silent reading room, gorgeous, few outlets" } },
  { id: "tcc", code: "TCC", name: "Ronald Tutor Campus Center", lat: 34.020258, lng: -118.286393, kind: "student_center", capacity: 600,
    studySpot: { quiet: false, outlets: true, openLate: true, note: "Lively, food court downstairs, tables upstairs" } },
  { id: "tommy", code: "HCP", name: "Hahn Plaza / Tommy Trojan", lat: 34.020536, lng: -118.285465, kind: "outdoor", capacity: 250 },
  { id: "bov", code: "BOV", name: "Bovard Auditorium", lat: 34.020913, lng: -118.285529, kind: "arena", capacity: 1200 },
  { id: "lrc", code: "LRC", name: "Lyon Recreation Center", lat: 34.024349, lng: -118.288126, kind: "gym", capacity: 300 },
  // the gym under Cale and Irani residential colleges at USC Village
  { id: "vfc", code: "VFC", name: "USC Village Fitness Center", lat: 34.024912, lng: -118.285658, kind: "gym", capacity: 220 },
  // the pool next to the Lyon Center
  { id: "uac", code: "UAC", name: "Uytengsu Aquatics Center", lat: 34.024059, lng: -118.288545, kind: "gym", capacity: 150 },
  { id: "vil", code: "VIL", name: "USC Village", lat: 34.025481, lng: -118.284197, kind: "dining", capacity: 700 },
  { id: "sal", code: "SAL", name: "Salvatori Computer Science Center", lat: 34.019384, lng: -118.289520, kind: "classroom", capacity: 200,
    studySpot: { quiet: true, outlets: true, openLate: true, note: "CS lab vibes, whiteboards, usually calm" } },
  { id: "rth", code: "RTH", name: "Ronald Tutor Hall", lat: 34.020182, lng: -118.289980, kind: "classroom", capacity: 300,
    studySpot: { quiet: false, outlets: true, openLate: true, note: "Viterbi hangout, open study tables" } },
  { id: "sgm", code: "SGM", name: "Seeley G. Mudd Building", lat: 34.021291, lng: -118.289192, kind: "classroom", capacity: 250 },
  { id: "jff", code: "JFF", name: "Fertitta Hall (Marshall)", lat: 34.018812, lng: -118.282401, kind: "classroom", capacity: 400,
    studySpot: { quiet: false, outlets: true, openLate: false, note: "Marshall study pods, bright and modern" } },
  { id: "hoh", code: "HOH", name: "Hoffman Hall", lat: 34.018973, lng: -118.285626, kind: "classroom", capacity: 250 },
  { id: "jkp", code: "JKP", name: "Popovich Hall", lat: 34.018692, lng: -118.283051, kind: "classroom", capacity: 250 },
  { id: "thh", code: "THH", name: "Taper Hall", lat: 34.022341, lng: -118.284409, kind: "classroom", capacity: 400 },
  { id: "wph", code: "WPH", name: "Waite Phillips Hall", lat: 34.022109, lng: -118.283800, kind: "classroom", capacity: 300 },
  { id: "ann", code: "ANN", name: "Wallis Annenberg Hall", lat: 34.020772, lng: -118.286974, kind: "classroom", capacity: 300,
    studySpot: { quiet: false, outlets: true, openLate: false, note: "Media center, big screens, café nearby" } },
  { id: "gfs", code: "GFS", name: "Grace Ford Salvatori Hall", lat: 34.021308, lng: -118.288056, kind: "classroom", capacity: 250 },
  { id: "kap", code: "KAP", name: "Kaprielian Hall", lat: 34.022403, lng: -118.291016, kind: "classroom", capacity: 200 },
  { id: "gin", code: "GIN", name: "Ginsburg Hall", lat: 34.021728, lng: -118.290445, kind: "classroom", capacity: 500 },
  { id: "mcq", code: "MCQ", name: "McCarthy Quad", lat: 34.020943, lng: -118.283156, kind: "outdoor", capacity: 400,
    studySpot: { quiet: false, outlets: false, openLate: false, note: "Grass, sun, hammocks — not for exam cramming" } },
  { id: "crm", code: "CRF", name: "Cromwell Field", lat: 34.022038, lng: -118.287864, kind: "field", capacity: 120 },
  { id: "gal", code: "GAL", name: "Galen Center", lat: 34.020876, lng: -118.280009, kind: "arena", capacity: 1500 },
  { id: "pks", code: "PKS", name: "Parkside Dining Hall", lat: 34.019479, lng: -118.290618, kind: "dining", capacity: 400 },
  { id: "evk", code: "EVK", name: "Everybody's Kitchen", lat: 34.021384, lng: -118.282125, kind: "dining", capacity: 350 },
  { id: "sci", code: "SCI", name: "Cinematic Arts Complex", lat: 34.023380, lng: -118.286155, kind: "classroom", capacity: 300,
    studySpot: { quiet: true, outlets: true, openLate: false, note: "Courtyard tables, film-school calm" } },
  { id: "col", code: "COL", name: "LA Memorial Coliseum", lat: 34.013980, lng: -118.287851, kind: "arena", capacity: 4000 },
  { id: "mus", code: "MUS", name: "Thornton School of Music", lat: 34.022731, lng: -118.285254, kind: "classroom", capacity: 200 },
];

/** All buildings: core + every other named building, so any place can be tagged and pinned exactly. */
const CORE_NAMES = new Set(CORE_BUILDINGS.map((b) => b.name.toLowerCase()));
export const BUILDINGS: Building[] = [...CORE_BUILDINGS, ...(OSM_BUILDINGS as Building[]).filter((b) => !CORE_NAMES.has(b.name.toLowerCase()))];

/** Street corners around campus, so off-campus DPS alerts can be placed exactly. */
export const INTERSECTIONS: { id: string; name: string; lat: number; lng: number }[] = [
  { id: "fig_37th", name: "Figueroa St & 37th St", lat: 34.017971, lng: -118.280087 },
  { id: "fig_jefferson", name: "Figueroa St & Jefferson Blvd", lat: 34.02219, lng: -118.280392 },
  { id: "hoover_jefferson", name: "Hoover St & Jefferson Blvd", lat: 34.023284, lng: -118.28325 },
  { id: "vermont_jefferson", name: "Vermont Ave & Jefferson Blvd", lat: 34.025415, lng: -118.291185 },
  { id: "vermont_exposition", name: "Vermont Ave & Exposition Blvd", lat: 34.018585, lng: -118.291698 },
];

export const BUILDING_BY_ID: Record<string, Building> = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));

export const SCHOOLS: { id: SchoolId; name: string; short: string }[] = [
  { id: "all", name: "All of USC", short: "All" },
  { id: "viterbi", name: "Viterbi School of Engineering", short: "Viterbi" },
  { id: "marshall", name: "Marshall School of Business", short: "Marshall" },
  { id: "dornsife", name: "Dornsife College", short: "Dornsife" },
  { id: "annenberg", name: "Annenberg School", short: "Annenberg" },
  { id: "sca", name: "School of Cinematic Arts", short: "SCA" },
  { id: "thornton", name: "Thornton School of Music", short: "Thornton" },
  { id: "roski", name: "Roski School of Art & Design", short: "Roski" },
  { id: "price", name: "Price School of Public Policy", short: "Price" },
  { id: "iovine", name: "Iovine & Young Academy", short: "Iovine" },
];

/** Event types and colors. None of them red (safety), gold (live games) or blue (you). */
export const CATEGORY_META: Record<string, { label: string; short: string; color: string }> = {
  sports_play: { label: "Sports · Play", short: "Play", color: "#16a34a" },
  sports_watch: { label: "Sports · Watch", short: "Watch", color: "#16a34a" },
  career: { label: "Career", short: "Career", color: "#4f46e5" },
  academic: { label: "Academic", short: "Academic", color: "#0d9488" },
  usc: { label: "USC event", short: "USC", color: "#db2777" },
  student: { label: "Student event", short: "Student", color: "#9333ea" },
  community: { label: "Community", short: "Community", color: "#78716c" },
  class: { label: "Class", short: "Class", color: "#64748b" },
};
/** the types people can filter by or create (classes come from your schedule) */
export const EVENT_TYPES = ["sports_play", "sports_watch", "career", "academic", "usc", "student", "community"] as const;

const WALK_M_PER_MIN = 80;

export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function walkMinutes(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  // campus paths aren't straight lines; 1.3x detour factor
  return Math.max(1, Math.round((distanceMeters(a, b) * 1.3) / WALK_M_PER_MIN));
}


/** Loose match of a free-text location ("SAL 101", "Leavey", "Lyon Center") to a building id. */
/** Words that appear in many building names; they count, but much less than distinctive ones. */
const GENERIC = new Set([
  "hall", "halls", "tower", "towers", "center", "centre", "building", "house", "residential", "college", "school", "the", "of", "and", "for",
  "usc", "apartments", "apartment", "structure", "parking", "library", "memorial", "campus", "science", "sciences", "arts", "field", "plaza",
  "research", "institute", "student", "students", "university", "foundation", "complex", "international", "theatre", "theater", "west", "east",
  "north", "south", "street", "st", "ave", "blvd", "way", "to", "get", "how", "do", "i", "me", "take", "walk", "directions", "go", "where", "is",
]);
const ALIASES: Record<string, string> = {
  "village gym": "vfc", "village fitness": "vfc", "fitness center": "vfc", pool: "uac", aquatics: "uac", "aquatics center": "uac", uytengsu: "uac",
  village: "vil", "usc village": "vil", leavey: "lvl", doheny: "dml", lyon: "lrc", "lyon center": "lrc", coliseum: "col", galen: "gal",
  "tommy trojan": "tommy", tommy: "tommy", parkside: "pks", evk: "evk", "everybody's kitchen": "evk", taper: "thh", annenberg: "ann",
  "campus center": "tcc", marshall: "jff", "cinema school": "sci", "film school": "sci", thornton: "mus",
};
const tokens = (s: string) => s.toLowerCase().replace(/['’]/g, "").split(/[^a-z0-9]+/).filter(Boolean);

/**
 * Best building for free text ("how do i get to Webb Tower", "SAL 101", "Leavey").
 * Scores every building: typed code > distinctive name words > generic words, so "Webb Tower" beats "Marks Tower".
 */
export function matchBuilding(text: string | undefined | null): string | undefined {
  if (!text) return undefined;
  const lower = text.toLowerCase();
  const q = new Set(tokens(text));
  for (const [alias, id] of Object.entries(ALIASES)) {
    if (new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lower) && BUILDING_BY_ID[id]) return id;
  }
  let best: { id: string; score: number } | null = null;
  for (const b of BUILDINGS) {
    let score = 0;
    // codes: "THH" typed in capitals, or any case for 3+ letter codes; 2-letter codes only in capitals (so "to"/"at" never match)
    const code = b.code;
    if (new RegExp(`\\b${code}\\b`).test(text) || (code.length >= 3 && q.has(code.toLowerCase()))) score += 10;
    const words = tokens(b.name.replace(/\(.*?\)/g, ""));
    const distinctive = words.filter((w) => w.length > 2 && !GENERIC.has(w));
    const dHits = distinctive.filter((w) => q.has(w)).length;
    const gHits = words.filter((w) => GENERIC.has(w) && w.length > 3 && q.has(w)).length;
    if (dHits) score += 3 * dHits + gHits + (lower.includes(b.name.toLowerCase()) ? 5 : 0);
    if (score > 0 && (!best || score > best.score || (score === best.score && !b.minor))) best = { id: b.id, score };
  }
  return best?.id;
}
