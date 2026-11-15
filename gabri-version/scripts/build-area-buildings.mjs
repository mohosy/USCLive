/**
 * Builds public/data/area-buildings.json: OpenStreetMap building footprints around USC, for the 3D Explore map.
 * Area: north to the I-10, east two blocks past the I-110, south past Expo Park and the Coliseum, west to Normandie.
 * Buildings inside the campus outline are left out (public/data/usc-campus.json already has them).
 * Run: node scripts/build-area-buildings.mjs   (data © OpenStreetMap contributors, ODbL)
 */
import { readFileSync, writeFileSync } from "node:fs";

export const AREA = { south: 34.0065, west: -118.3012, north: 34.0362, east: -118.2735 };

const campus = JSON.parse(readFileSync(new URL("../public/data/usc-campus.json", import.meta.url))).campus.geometry;
const inRing = ([x, y], ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const polys = campus.type === "MultiPolygon" ? campus.coordinates : [campus.coordinates];
const onCampus = (p) => polys.some(([outer, ...holes]) => inRing(p, outer) && !holes.some((h) => inRing(p, h)));

const q = `[out:json][timeout:90];way["building"](${AREA.south},${AREA.west},${AREA.north},${AREA.east});out geom tags;`;
const res = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", body: new URLSearchParams({ data: q }), headers: { "User-Agent": "USCLive hackathon build script" } });
if (!res.ok) throw new Error(`Overpass ${res.status}`);
const { elements } = await res.json();

const r5 = (n) => Math.round(n * 1e5) / 1e5; // ~1 m precision keeps the file small
const features = [];
for (const el of elements) {
  if (el.type !== "way" || !el.geometry || el.geometry.length < 4) continue;
  const ring = el.geometry.map((g) => [r5(g.lon), r5(g.lat)]);
  const c = ring.reduce((a, p) => [a[0] + p[0] / ring.length, a[1] + p[1] / ring.length], [0, 0]);
  if (onCampus(c)) continue;
  const t = el.tags ?? {};
  const levels = parseFloat(t["building:levels"]);
  const h = parseFloat(t.height) || (levels ? levels * 3.3 : t.building === "garage" || t.building === "shed" ? 3 : t.building === "house" || t.building === "residential" ? 7 : 9);
  features.push({ type: "Feature", properties: { h: Math.min(120, Math.round(h * 10) / 10) }, geometry: { type: "Polygon", coordinates: [ring] } });
}
writeFileSync(new URL("../public/data/area-buildings.json", import.meta.url), JSON.stringify({ type: "FeatureCollection", area: AREA, features }));
console.log(`wrote ${features.length} buildings`);
