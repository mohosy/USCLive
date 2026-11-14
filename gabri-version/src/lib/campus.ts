import type { Building, SchoolId } from "./types";

/** USC University Park Campus. Coordinates are approximate (good enough for pins). */
export const USC_CENTER: [number, number] = [-118.2851, 34.0208]; // [lng, lat]

export const BUILDINGS: Building[] = [
  { id: "lvl", code: "LVL", name: "Leavey Library", lat: 34.0217, lng: -118.2829, kind: "library", capacity: 450,
    studySpot: { quiet: false, outlets: true, openLate: true, note: "24/7 during the semester, group rooms on the lower level" } },
  { id: "dml", code: "DML", name: "Doheny Memorial Library", lat: 34.0202, lng: -118.2838, kind: "library", capacity: 350,
    studySpot: { quiet: true, outlets: false, openLate: false, note: "Silent reading room, gorgeous, few outlets" } },
  { id: "tcc", code: "TCC", name: "Ronald Tutor Campus Center", lat: 34.0203, lng: -118.2863, kind: "student_center", capacity: 600,
    studySpot: { quiet: false, outlets: true, openLate: true, note: "Lively, food court downstairs, tables upstairs" } },
  { id: "tommy", code: "HCP", name: "Hahn Plaza / Tommy Trojan", lat: 34.0206, lng: -118.2853, kind: "outdoor", capacity: 250 },
  { id: "bov", code: "BOV", name: "Bovard Auditorium", lat: 34.0212, lng: -118.2853, kind: "arena", capacity: 1200 },
  { id: "lrc", code: "LRC", name: "Lyon Recreation Center", lat: 34.0241, lng: -118.2881, kind: "gym", capacity: 300 },
  { id: "vil", code: "VIL", name: "USC Village", lat: 34.0255, lng: -118.2853, kind: "dining", capacity: 700 },
  { id: "sal", code: "SAL", name: "Salvatori Computer Science Center", lat: 34.0195, lng: -118.2894, kind: "classroom", capacity: 200,
    studySpot: { quiet: true, outlets: true, openLate: true, note: "CS lab vibes, whiteboards, usually calm" } },
  { id: "rth", code: "RTH", name: "Ronald Tutor Hall", lat: 34.0201, lng: -118.2899, kind: "classroom", capacity: 300,
    studySpot: { quiet: false, outlets: true, openLate: true, note: "Viterbi hangout, open study tables" } },
  { id: "sgm", code: "SGM", name: "Seeley G. Mudd Building", lat: 34.0212, lng: -118.2891, kind: "classroom", capacity: 250 },
  { id: "jff", code: "JFF", name: "Fertitta Hall (Marshall)", lat: 34.0188, lng: -118.2826, kind: "classroom", capacity: 400,
    studySpot: { quiet: false, outlets: true, openLate: false, note: "Marshall study pods, bright and modern" } },
  { id: "hoh", code: "HOH", name: "Hoffman Hall", lat: 34.0186, lng: -118.2857, kind: "classroom", capacity: 250 },
  { id: "jkp", code: "JKP", name: "Popovich Hall", lat: 34.0190, lng: -118.2843, kind: "classroom", capacity: 250 },
  { id: "thh", code: "THH", name: "Taper Hall", lat: 34.0222, lng: -118.2846, kind: "classroom", capacity: 400 },
  { id: "wph", code: "WPH", name: "Waite Phillips Hall", lat: 34.0219, lng: -118.2840, kind: "classroom", capacity: 300 },
  { id: "ann", code: "ANN", name: "Wallis Annenberg Hall", lat: 34.0222, lng: -118.2866, kind: "classroom", capacity: 300,
    studySpot: { quiet: false, outlets: true, openLate: false, note: "Media center, big screens, café nearby" } },
  { id: "gfs", code: "GFS", name: "Grace Ford Salvatori Hall", lat: 34.0213, lng: -118.2878, kind: "classroom", capacity: 250 },
  { id: "kap", code: "KAP", name: "Kaprielian Hall", lat: 34.0225, lng: -118.2911, kind: "classroom", capacity: 200 },
  { id: "gin", code: "GIN", name: "Ginsburg Hall", lat: 34.0193, lng: -118.2878, kind: "classroom", capacity: 500 },
  { id: "mcq", code: "MCQ", name: "McCarthy Quad", lat: 34.0213, lng: -118.2828, kind: "outdoor", capacity: 400,
    studySpot: { quiet: false, outlets: false, openLate: false, note: "Grass, sun, hammocks — not for exam cramming" } },
  { id: "crm", code: "CRF", name: "Cromwell Field", lat: 34.0227, lng: -118.2879, kind: "field", capacity: 120 },
  { id: "gal", code: "GAL", name: "Galen Center", lat: 34.0215, lng: -118.2797, kind: "arena", capacity: 1500 },
  { id: "pks", code: "PKS", name: "Parkside Dining Hall", lat: 34.0189, lng: -118.2911, kind: "dining", capacity: 400 },
  { id: "evk", code: "EVK", name: "Everybody's Kitchen", lat: 34.0215, lng: -118.2826, kind: "dining", capacity: 350 },
  { id: "sci", code: "SCI", name: "Cinematic Arts Complex", lat: 34.0233, lng: -118.2861, kind: "classroom", capacity: 300,
    studySpot: { quiet: true, outlets: true, openLate: false, note: "Courtyard tables, film-school calm" } },
  { id: "mus", code: "MUS", name: "Thornton School of Music", lat: 34.0199, lng: -118.2860, kind: "classroom", capacity: 200 },
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

export const CATEGORY_META: Record<string, { label: string; color: string }> = {
  social: { label: "Social", color: "#e11d48" },
  sports: { label: "Sports", color: "#16a34a" },
  study: { label: "Study", color: "#2563eb" },
  academic: { label: "Academic", color: "#7c3aed" },
  career: { label: "Career", color: "#0891b2" },
  club: { label: "Club", color: "#ea580c" },
  arts: { label: "Arts", color: "#db2777" },
  office_hours: { label: "Office hours", color: "#9333ea" },
  class: { label: "Class", color: "#64748b" },
};

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

const STOP = new Set(["hall", "center", "building", "school", "library", "memorial", "campus", "science", "computer", "arts", "field", "plaza"]);

/** Loose match of a free-text location ("SAL 101", "Leavey", "Lyon Center") to a building id. */
export function matchBuilding(text: string | undefined | null): string | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase();
  for (const b of BUILDINGS) {
    if (new RegExp(`\\b${b.code.toLowerCase()}\\b`).test(t)) return b.id;
  }
  for (const b of BUILDINGS) {
    const words = b.name.toLowerCase().replace(/[()]/g, "").split(/[\s/]+/).filter((w) => w.length > 3 && !STOP.has(w));
    if (words.some((w) => t.includes(w))) return b.id;
  }
  return undefined;
}
