"use client";

import mapboxgl from "mapbox-gl";
import type { CampusWeather } from "@/lib/weather";
import WeatherEffects from "./weather/WeatherEffects";
import MapControls from "./MapControls";
import type { Feature, FeatureCollection } from "geojson";
import { useEffect, useRef, useState } from "react";
import { CATEGORY_META, USC_CENTER } from "@/lib/campus";
import type { Callout } from "@/lib/callouts";
import { isLive, type Building, type EventView, type Hotspot, type Loc, type SafetyAlert } from "@/lib/client-types";
import { calloutHTML } from "@/lib/calloutHtml";
import { declutter } from "@/lib/declutter";
import { alertStyle } from "@/lib/alertStyle";
import { WEBCAMS } from "@/lib/webcams";
import { allIconKeys, iconCanvas, iconKey, ICON_PX, ICON_RATIO } from "@/lib/eventIcons";
import type { LightPreset } from "@/lib/sun";

/** the 3D film camera that stands on the map at every live webcam */
const CAM_MODEL = "/models/film-camera.glb";
/** the red police beacon that stands at every DPS alert */
const BEACON_MODEL = "/models/dps-beacon.glb";
/** model lens points east (+X); Mapbox turns models clockwise, so this faces it toward a compass heading */
const camYaw = (heading: number) => heading - 90;

function alertPoints(alerts: SafetyAlert[]): FC {
  return { type: "FeatureCollection", features: alerts.map((a) => ({ type: "Feature", properties: { id: `al:${a.id}`, title: a.title }, geometry: { type: "Point", coordinates: [a.lng, a.lat] } })) };
}
import { LEVEL_COLOR } from "./ui";
import { WalkGuide, type WalkProgress } from "./walk/WalkGuide";
import WalkHUD from "./walk/WalkHUD";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

export type MapStyle = "map" | "satellite";
const STYLES: Record<MapStyle, { url: string; config: Record<string, unknown> }> = {
  // Mapbox Standard: 3D buildings, landmark models, trees, lighting
  // Mapbox's own POIs, landmark icons and place names are off: every label on the map is ours.
  map: {
    url: "mapbox://styles/mapbox/standard",
    // Mapbox's 3D buildings are off: we draw only USC's buildings (see installSpotlight). Trees/landmarks stay, clipped to campus.
    config: { lightPreset: "day", show3dObjects: true, show3dBuildings: false, show3dLandmarks: true, show3dTrees: true, showTransitLabels: false, showRoadLabels: true },
  },
  // Aerial imagery: shown as the placeholder while the photoreal 3D view loads
  satellite: {
    url: "mapbox://styles/mapbox/standard-satellite",
    config: { lightPreset: "day", showTransitLabels: false, showRoadLabels: true },
  },
};

/** Mapbox's own POI / landmark / place labels, toggled by the "Places" button. */
function placeConfig(style: MapStyle, on: boolean): Record<string, boolean> {
  const c: Record<string, boolean> = { showPointOfInterestLabels: on, showPlaceLabels: on };
  if (style === "map") Object.assign(c, { showLandmarkIcons: on, showLandmarkIconLabels: on });
  return c;
}

// ---------- USC focus ("spotlight") ----------
// Campus (UPC + USC Village, from OpenStreetMap) stays in full color with its buildings in 3D;
// everything outside the boundary is flat and faded, with a few landmarks kept for orientation.
interface CampusData { campus: Feature; mask: Feature; buildings: FeatureCollection }
let campusPromise: Promise<CampusData> | null = null;
const loadCampus = () =>
  (campusPromise ??= fetch("/data/usc-campus.json")
    .then((r) => { if (!r.ok) throw new Error(`campus data ${r.status}`); return r.json() as Promise<CampusData>; })
    .catch((e) => { campusPromise = null; throw e; }));

/** The neighborhood drawn in 3D around campus: north to the I-10, east past the I-110, south past Expo Park, west to Normandie. */
const AREA = { south: 34.0065, west: -118.3012, north: 34.0362, east: -118.2735 };
/** Everything outside AREA (a world polygon with the area cut out): washed out and flat. */
const AREA_MASK: Feature = {
  type: "Feature", properties: {},
  geometry: { type: "Polygon", coordinates: [
    [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]],
    [[AREA.west, AREA.south], [AREA.west, AREA.north], [AREA.east, AREA.north], [AREA.east, AREA.south], [AREA.west, AREA.south]],
  ] },
};
/** OpenStreetMap footprints for the area outside campus (scripts/build-area-buildings.mjs), loaded after the map is up. */
let areaPromise: Promise<FeatureCollection> | null = null;
const loadArea = () =>
  (areaPromise ??= fetch("/data/area-buildings.json")
    .then((r) => { if (!r.ok) throw new Error(`area data ${r.status}`); return r.json() as Promise<FeatureCollection>; })
    .catch((e) => { areaPromise = null; throw e; }));

/** Neighborhood buildings in 3D, a shade grayer than USC's so campus still stands out (idempotent). */
function installArea(m: mapboxgl.Map, fc: FeatureCollection, light: LightPreset) {
  if (m.getSource("area-buildings")) return;
  m.addSource("area-buildings", { type: "geojson", data: fc });
  m.addLayer({
    id: "area-buildings", type: "fill-extrusion", source: "area-buildings", slot: "middle", minzoom: 14,
    paint: {
      "fill-extrusion-color": ["interpolate", ["linear"], ["get", "h"], 0, "#ebe8e4", 20, "#e2ded9", 60, "#d8d3cd"],
      "fill-extrusion-height": ["get", "h"],
      "fill-extrusion-opacity": 0.92,
      "fill-extrusion-ambient-occlusion-intensity": 0.25,
      "fill-extrusion-ambient-occlusion-radius": 3,
      // faint street-light glow at night (applyLight); campus stays the warm one
      "fill-extrusion-flood-light-color": "#ffc98f",
      "fill-extrusion-flood-light-intensity": 0,
      "fill-extrusion-flood-light-wall-radius": 6,
      "fill-extrusion-flood-light-ground-radius": 4,
    },
  }, m.getLayer("usc-buildings") ? "usc-buildings" : undefined);
  applyLight(m, light);
}

const CONTEXT_LABELS: FeatureCollection = {
  type: "FeatureCollection",
  features: ([
    ["LA Memorial Coliseum", -118.2879, 34.0141],
    ["Natural History Museum", -118.2888, 34.0171],
    ["California Science Center", -118.2859, 34.0156],
    ["BMO Stadium", -118.2842, 34.0128],
  ] as const).map(([name, lng, lat]) => ({ type: "Feature", properties: { name }, geometry: { type: "Point", coordinates: [lng, lat] } })),
};

// How the spotlight looks under each light. Night: outside sinks into deep blue, campus buildings get warm flood lights.
const LOOK: Record<LightPreset, { wash: string; washOp: number; edge: string; glow: number; bld: [string, string, string]; flood: number; emissive: number; label: string; halo: string; area: [string, string, string]; areaFlood: number }> = {
  dawn: { wash: "#f5e8de", washOp: 0.62, edge: "#a3122a", glow: 0.16, bld: ["#f5e6d6", "#efdac4", "#e6cbb0"], flood: 0.12, emissive: 0.04, label: "#7d716c", halo: "rgba(255,247,240,0.95)", area: ["#efe6df", "#e7ddd5", "#ddd2c9"], areaFlood: 0 },
  day: { wash: "#f3f1ee", washOp: 0.8, edge: "#990000", glow: 0.12, bld: ["#f2e9de", "#eadccc", "#e0cdb9"], flood: 0, emissive: 0, label: "#7b8088", halo: "rgba(255,255,255,0.95)", area: ["#ebe8e4", "#e2ded9", "#d8d3cd"], areaFlood: 0 },
  dusk: { wash: "#2a2140", washOp: 0.3, edge: "#c41e3a", glow: 0.3, bld: ["#ffe2c4", "#f8d3ae", "#efc499"], flood: 0.3, emissive: 0.16, label: "#f4e7dd", halo: "rgba(42,30,52,0.85)", area: ["#c9c7da", "#bebccf", "#b3b1c5"], areaFlood: 0.08 },
  night: { wash: "#090e1d", washOp: 0.52, edge: "#e0303f", glow: 0.45, bld: ["#f6dcb6", "#efcd9f", "#e5bd8a"], flood: 0.9, emissive: 0.22, label: "#d8dde8", halo: "rgba(8,12,26,0.9)", area: ["#aeb5c6", "#a2a9bb", "#969daf"], areaFlood: 0.25 },
};

/** Switch Mapbox's light preset and restyle the spotlight to match. Safe to call before the spotlight exists. */
function applyLight(m: mapboxgl.Map, light: LightPreset) {
  if (m.getConfigProperty("basemap", "lightPreset") !== light) m.setConfigProperty("basemap", "lightPreset", light);
  const k = LOOK[light];
  const set = (layer: string, prop: string, v: unknown) => { if (m.getLayer(layer)) m.setPaintProperty(layer, prop as never, v as never); };
  set("usc-fade", "fill-color", k.wash);
  set("usc-fade", "fill-opacity", k.washOp);
  set("usc-edge", "line-color", k.edge);
  set("usc-edge-glow", "line-color", k.edge);
  set("usc-edge-glow", "line-opacity", k.glow);
  set("usc-buildings", "fill-extrusion-color", ["interpolate", ["linear"], ["get", "h"], 0, k.bld[0], 20, k.bld[1], 45, k.bld[2]]);
  set("usc-buildings", "fill-extrusion-flood-light-intensity", k.flood);
  set("usc-buildings", "fill-extrusion-emissive-strength", k.emissive);
  set("area-buildings", "fill-extrusion-color", ["interpolate", ["linear"], ["get", "h"], 0, k.area[0], 20, k.area[1], 60, k.area[2]]);
  set("area-buildings", "fill-extrusion-flood-light-intensity", k.areaFlood);
  set("usc-context-labels", "text-color", k.label);
  set("usc-context-labels", "text-halo-color", k.halo);
}

/** Adds the campus spotlight layers (idempotent). `before` keeps them under our alert/crowd layers when added late. */
function installSpotlight(m: mapboxgl.Map, sat: boolean, c: CampusData, light: LightPreset, before?: string) {
  if (m.getSource("usc-mask")) return;
  const at = before && m.getLayer(before) ? before : undefined;
  m.addSource("usc-mask", { type: "geojson", data: AREA_MASK }); // fade beyond the 3D neighborhood (campus keeps its outline)
  m.addSource("usc-campus", { type: "geojson", data: c.campus });
  m.addSource("usc-buildings", { type: "geojson", data: c.buildings });
  m.addSource("usc-context", { type: "geojson", data: CONTEXT_LABELS });
  // wash out everything outside campus
  m.addLayer({ id: "usc-fade", type: "fill", source: "usc-mask", slot: "middle", paint: { "fill-color": sat ? "#f7f5f2" : "#f3f1ee", "fill-opacity": sat ? 0.58 : 0.8, "fill-emissive-strength": 1 } }, at);
  // campus edge: soft cardinal glow + crisp line
  m.addLayer({ id: "usc-edge-glow", type: "line", source: "usc-campus", slot: "middle", layout: { "line-join": "round" }, paint: { "line-color": "#990000", "line-width": 9, "line-opacity": 0.12, "line-blur": 6, "line-emissive-strength": 1 } }, at);
  m.addLayer({ id: "usc-edge", type: "line", source: "usc-campus", slot: "middle", layout: { "line-join": "round" }, paint: { "line-color": "#990000", "line-width": 2, "line-opacity": 0.8, "line-emissive-strength": 1 } }, at);
  // USC's own buildings, extruded to their real heights (map view only: on the photo they'd hide the real roofs)
  if (!sat) m.addLayer({
    id: "usc-buildings", type: "fill-extrusion", source: "usc-buildings", slot: "middle",
    paint: {
      "fill-extrusion-color": ["interpolate", ["linear"], ["get", "h"], 0, "#f2e9de", 20, "#eadccc", 45, "#e0cdb9"],
      "fill-extrusion-height": ["get", "h"],
      "fill-extrusion-base": ["get", "mh"],
      "fill-extrusion-opacity": 0.97,
      "fill-extrusion-ambient-occlusion-intensity": 0.3,
      "fill-extrusion-ambient-occlusion-radius": 3,
      // warm uplighting on the walls and a pool of light on the ground; only turned up at dusk/night (applyLight)
      "fill-extrusion-flood-light-color": "#ffb066",
      "fill-extrusion-flood-light-intensity": 0,
      "fill-extrusion-flood-light-wall-radius": ["min", ["get", "h"], 18],
      "fill-extrusion-flood-light-ground-radius": 7,
    },
  }, at);
  // a few off-campus landmarks for orientation (Mapbox's own labels outside are faded)
  m.addLayer({
    id: "usc-context-labels", type: "symbol", source: "usc-context", slot: "top", minzoom: 14.5,
    layout: { "text-field": ["get", "name"], "text-size": 11.5, "text-letter-spacing": 0.02, "text-max-width": 9 },
    paint: { "text-color": "#7b8088", "text-halo-color": "rgba(255,255,255,0.95)", "text-halo-width": 1.4, "text-emissive-strength": 1 },
  });
  // remove Mapbox's 3D trees and landmark models outside campus (our own layers are not affected)
  m.addLayer({ id: "usc-clip", type: "clip", source: "usc-mask", layout: { "clip-layer-types": ["model"], "clip-layer-scope": ["basemap"] } });
  applyLight(m, light);
}

// Keep the camera on USC University Park Campus (plus a little margin).
const USC_BOUNDS: [[number, number], [number, number]] = [[-118.3035, 34.0045], [-118.2712, 34.0382]]; // the 3D neighborhood plus a little margin

export interface Camera { longitude: number; latitude: number; zoom: number; pitch: number; bearing: number }

export interface MapLayers { events: boolean; hotspots: boolean; columns: boolean; places: boolean }

interface Props {
  weather: CampusWeather;
  events: EventView[];
  hotspots: Hotspot[];
  buildings: Building[];
  me: Loc;
  layers: MapLayers;
  mapStyle: MapStyle;
  selectedEventId: string | null;
  highlightIds: string[] | null; // when set, everything else is dimmed
  focus: { lat: number; lng: number; zoom?: number; key: number } | null;
  onSelectEvent: (id: string) => void;
  onSelectBuilding: (id: string) => void;
  callouts: Callout[];
  alerts: SafetyAlert[];
  onCallout: (c: Callout) => void;
  initialCamera?: Camera | null;
  /** pixels covered by the side panel on the left; the map keeps its focus in the visible part */
  leftInset?: number;
  /** play the globe-to-campus intro flight (first load only) */
  intro?: boolean;
  onIntroDone?: () => void;
  onCamera?: (c: Camera) => void;
  /** "How do I get to THH" — animated 3D walk from `me` to this building. */
  walk: { to: Building; key: number } | null;
  onWalkEnd: () => void;
  /** dawn / day / dusk / night lighting (follows the real sun; see lib/sun) */
  light?: LightPreset;
}

type FC = FeatureCollection;
const EMPTY: FC = { type: "FeatureCollection", features: [] };

function circlePolygon(lng: number, lat: number, radiusM: number, steps = 20) {
  const coords: [number, number][] = [];
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    coords.push([lng + Math.cos(a) * dLng, lat + Math.sin(a) * dLat]);
  }
  return coords;
}

function hotspotGeo(hotspots: Hotspot[], buildings: Building[]): { points: FC; columns: FC } {
  const byId = Object.fromEntries(buildings.map((b) => [b.id, b]));
  const visible = hotspots.filter((h) => !h.suppressed && byId[h.buildingId]);
  return {
    points: {
      type: "FeatureCollection",
      features: visible.map((h) => ({
        type: "Feature",
        properties: { id: h.buildingId, weight: Math.min(1, h.count / 400), ratio: h.ratio, level: h.level, count: h.count, name: byId[h.buildingId].name },
        geometry: { type: "Point", coordinates: [byId[h.buildingId].lng, byId[h.buildingId].lat] },
      })),
    },
    columns: {
      type: "FeatureCollection",
      features: visible.map((h) => ({
        type: "Feature",
        properties: { id: h.buildingId, height: 15 + Math.min(90, h.count * 0.12 * Math.max(0.6, h.ratio)), color: LEVEL_COLOR[h.level] },
        geometry: { type: "Polygon", coordinates: [circlePolygon(byId[h.buildingId].lng, byId[h.buildingId].lat, 7)] },
      })),
    },
  };
}

function buildingLabelGeo(buildings: Building[]): FC {
  return {
    type: "FeatureCollection",
    features: buildings.map((b) => ({ type: "Feature", properties: { id: b.id, name: b.name, minor: !!b.minor }, geometry: { type: "Point", coordinates: [b.lng, b.lat] } })),
  };
}

function alertGeo(alerts: SafetyAlert[]): FC {
  return {
    type: "FeatureCollection",
    features: alerts.map((a) => {
      const st = alertStyle(a);
      return { type: "Feature", properties: { id: a.id, color: `rgb(${st.rgb.join(",")})`, fill: st.fill, line: st.line }, geometry: { type: "Polygon", coordinates: [circlePolygon(a.lng, a.lat, st.radiusM, 40)] } };
    }),
  };
}

/** Events as GeoJSON points. Several events in one building fan out in a small ring. */
function eventGeo(events: EventView[], selectedId: string | null, highlight: string[] | null): FC {
  const perBuilding = new Map<string, number>();
  const now = new Date();
  const features: Feature[] = [];
  for (const e of events) {
    if (e.lat == null || e.lng == null) continue;
    const idx = perBuilding.get(e.buildingId) ?? 0;
    perBuilding.set(e.buildingId, idx + 1);
    const angle = idx * 2.4;
    const r = idx === 0 ? 0 : 0.00007 + idx * 0.000015;
    features.push({
      type: "Feature",
      properties: {
        id: e.id,
        title: e.title.length > 28 ? `${e.title.slice(0, 27)}…` : e.title,
        color: (CATEGORY_META[e.category] ?? CATEGORY_META.student).color,
        icon: iconKey(e.category, e.id === selectedId, e.freeFood),
        // bigger events get slightly bigger icons
        scale: Math.round((0.85 + Math.min(0.3, Math.sqrt(e.attendeeCount) * 0.02)) * 100) / 100,
        radius: Math.round((ICON_PX / 2) * (0.85 + Math.min(0.3, Math.sqrt(e.attendeeCount) * 0.02))),
        live: isLive(e, now),
        selected: e.id === selectedId,
        dim: highlight ? !highlight.includes(e.id) : false,
        // selected and live pins draw on top
        sort: e.id === selectedId ? 2 : isLive(e, now) ? 1 : 0,
      },
      geometry: { type: "Point", coordinates: [e.lng + Math.cos(angle) * r * 1.2, e.lat + Math.sin(angle) * r] },
    });
  }
  return { type: "FeatureCollection", features };
}

export default function MapView(props: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const ready = useRef(false);
  const styleRef = useRef<MapStyle>(props.mapStyle);
  const meMarker = useRef<mapboxgl.Marker | null>(null);
  const data = useRef<{ events: FC; points: FC; columns: FC; buildings: FC; alerts: FC; cams: FC; alertPts: FC }>({ events: EMPTY, points: EMPTY, columns: EMPTY, buildings: buildingLabelGeo(props.buildings), alerts: EMPTY, cams: EMPTY, alertPts: EMPTY });
  const bubbles = useRef(new Map<string, { m: mapboxgl.Marker; el: HTMLDivElement; html: string; c: Callout }>());
  const cb = useRef(props);
  useEffect(() => { cb.current = props; });
  const walkRef = useRef<WalkGuide | null>(null);
  const [walkP, setWalkP] = useState<WalkProgress | null>(null);
  const campus = useRef<CampusData | null>(null);
  const area = useRef<FeatureCollection | null>(null);
  const [rotateHint, setRotateHint] = useState(false);
  const needle = useRef<SVGSVGElement>(null); // the compass needle in the control column

  /** Hide bubbles that would overlap a more important one (runs when the camera or the bubbles change). */
  function tidyBubbles() {
    const m = map.current;
    if (!m) return;
    declutter([...bubbles.current.values()].map((b) => { const p = m.project(b.m.getLngLat()); return { el: b.el, kind: b.c.kind, x: p.x, y: p.y }; }));
  }

  /** Upload new data to the map only when it actually changed (a 20s refresh usually changes nothing). */
  const sent = useRef<Record<string, string>>({});
  function setSource(id: string, fc: FC) {
    const src = map.current?.getSource(id) as mapboxgl.GeoJSONSource | undefined;
    if (!src) return;
    const json = JSON.stringify(fc);
    if (sent.current[id] === json) return;
    sent.current[id] = json;
    src.setData(fc);
  }

  function syncLayers() {
    const m = map.current;
    if (!m || !ready.current) return;
    const { events, hotspots, columns } = cb.current.layers;
    const vis = (on: boolean) => (on ? "visible" : "none");
    for (const id of ["ev-halo", "ev-pins", "ev-labels"]) m.setLayoutProperty(id, "visibility", vis(events));
    m.setLayoutProperty("hot-heat", "visibility", vis(hotspots));
    m.setLayoutProperty("hot-hit", "visibility", vis(hotspots));
    m.setLayoutProperty("hot-columns", "visibility", vis(columns));
    for (const [k, v] of Object.entries(placeConfig(styleRef.current, cb.current.layers.places))) {
      if (m.getConfigProperty("basemap", k) !== v) m.setConfigProperty("basemap", k, v);
    }
  }

  /** (Re)create our sources and layers. Runs on first load and after every style switch. */
  function install() {
    const m = map.current!;
    sent.current = {};
    const sat = styleRef.current === "satellite";
    m.addSource("events", { type: "geojson", data: data.current.events });
    m.addSource("hot-points", { type: "geojson", data: data.current.points });
    m.addSource("hot-columns", { type: "geojson", data: data.current.columns });
    m.addSource("building-labels", { type: "geojson", data: data.current.buildings });
    m.addSource("alerts", { type: "geojson", data: data.current.alerts });
    m.addSource("cams", { type: "geojson", data: data.current.cams });
    m.addSource("alert-pts", { type: "geojson", data: data.current.alertPts });
    // event type icons, drawn once on a canvas and uploaded as sprites
    for (const k of allIconKeys()) {
      if (m.hasImage(k)) continue;
      const cv = iconCanvas(k);
      m.addImage(k, cv.getContext("2d")!.getImageData(0, 0, cv.width, cv.height), { pixelRatio: ICON_RATIO });
    }
    if (!m.hasModel("film-cam")) m.addModel("film-cam", CAM_MODEL);
    if (!m.hasModel("dps-beacon")) m.addModel("dps-beacon", BEACON_MODEL);
    // USC spotlight first, so alerts, crowds and pins draw above it
    if (campus.current) installSpotlight(m, sat, campus.current, cb.current.light ?? "day");
    if (area.current && !sat) installArea(m, area.current, cb.current.light ?? "day");
    // DPS alert zones
    m.addLayer({ id: "alert-fill", type: "fill", source: "alerts", slot: "middle", paint: { "fill-color": ["get", "color"], "fill-opacity": ["get", "fill"], "fill-emissive-strength": 1 } });
    m.addLayer({ id: "alert-line", type: "line", source: "alerts", slot: "middle", paint: { "line-color": ["get", "color"], "line-width": 1.5, "line-opacity": ["get", "line"], "line-emissive-strength": 1 } });


    m.addLayer({
      id: "hot-heat", type: "heatmap", source: "hot-points", slot: "middle",
      paint: {
        "heatmap-weight": ["get", "weight"],
        "heatmap-intensity": 1,
        "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 15, 25, 18, 80],
        "heatmap-opacity": sat ? 0.55 : 0.45,
        "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(255,255,255,0)", 0.3, "rgba(250,204,21,.5)", 0.65, "rgba(234,88,12,.6)", 1, "rgba(220,38,38,.75)"],
      },
    });
    m.addLayer({
      id: "hot-columns", type: "fill-extrusion", source: "hot-columns", slot: "top",
      paint: { "fill-extrusion-color": ["get", "color"], "fill-extrusion-height": ["get", "height"], "fill-extrusion-opacity": 0.75, "fill-extrusion-emissive-strength": 0.8 },
    });
    // invisible hit area for crowd hover/click
    m.addLayer({ id: "hot-hit", type: "circle", source: "hot-points", slot: "top", paint: { "circle-radius": 18, "circle-opacity": 0 } });

    // our own building names (Mapbox POI labels are turned off)
    // building names: only the main ones by default, every building once you zoom in close
    m.addLayer({
      id: "building-names", type: "symbol", source: "building-labels", slot: "top", minzoom: 16, filter: ["!", ["get", "minor"]],
      layout: { "text-field": ["get", "name"], "text-size": ["interpolate", ["linear"], ["zoom"], 16, 10, 18, 12], "text-max-width": 8, "text-padding": 4, "text-anchor": "bottom", "text-offset": [0, -1.1] },
      paint: {
        "text-color": sat ? "#ffffff" : "#57534e",
        "text-halo-color": sat ? "rgba(0,0,0,.7)" : "rgba(255,255,255,.9)",
        "text-halo-width": 1.2,
        "text-emissive-strength": 1,
      },
    });

    m.addLayer({
      id: "building-names-minor", type: "symbol", source: "building-labels", slot: "top", minzoom: 17.6, filter: ["get", "minor"],
      layout: { "text-field": ["get", "name"], "text-size": ["interpolate", ["linear"], ["zoom"], 16, 10, 18, 12], "text-max-width": 8, "text-padding": 4, "text-anchor": "bottom", "text-offset": [0, -1.1] },
      paint: {
        "text-color": sat ? "#ffffff" : "#57534e",
        "text-halo-color": sat ? "rgba(0,0,0,.7)" : "rgba(255,255,255,.9)",
        "text-halo-width": 1.2,
        "text-emissive-strength": 1,
      },
    });

    const dimmed = ["case", ["get", "dim"], 0.25, 1] as unknown as number;
    m.addLayer({
      id: "ev-halo", type: "circle", source: "events", slot: "top", filter: ["==", ["get", "live"], true],
      paint: {
        "circle-radius": ["+", ["get", "radius"], 7],
        "circle-color": ["get", "color"],
        "circle-opacity": ["case", ["get", "dim"], 0.05, 0.22],
        "circle-pitch-alignment": "viewport",
        "circle-emissive-strength": 1,
      },
    });
    m.addLayer({
      id: "ev-pins", type: "symbol", source: "events", slot: "top",
      layout: {
        "icon-image": ["get", "icon"],
        "icon-size": ["case", ["get", "selected"], ["*", ["get", "scale"], 1.15], ["get", "scale"]],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "icon-pitch-alignment": "viewport",
        "symbol-sort-key": ["get", "sort"],
        "symbol-z-order": "source",
      },
      paint: { "icon-opacity": dimmed, "icon-emissive-strength": 1 },
    });
    // live webcams: a 3D film camera standing on the spot (GPU model layer; click opens the stream)
    m.addLayer({
      id: "cams-3d", type: "model", source: "cams", slot: "top",
      layout: { "model-id": "film-cam" },
      paint: {
        // Snap Map style: oversized, about the same size on screen at every zoom (halves per zoom level)
        "model-scale": ["interpolate", ["exponential", 2], ["zoom"], 15, ["literal", [58, 58, 58]], 19, ["literal", [4.5, 4.5, 4.5]]],
        // each camera faces the way it actually looks (GeoJSON can't carry arrays, so match on the id)
        "model-rotation": ["match", ["get", "id"], ...WEBCAMS.flatMap((w) => [`cam:${w.id}`, ["literal", [0, 0, camYaw(w.heading)]]]), ["literal", [0, 0, 90]]],
        "model-type": "common-3d",
        "model-cast-shadows": true,
        "model-emissive-strength": 0.6,
      },
    } as mapboxgl.LayerSpecification);
    // DPS alerts: a red police beacon standing in the zone (click for details)
    m.addLayer({
      id: "alerts-3d", type: "model", source: "alert-pts", slot: "top",
      layout: { "model-id": "dps-beacon" },
      paint: {
        "model-scale": ["interpolate", ["exponential", 2], ["zoom"], 15, ["literal", [60, 60, 60]], 19, ["literal", [5, 5, 5]]],
        "model-type": "common-3d",
        "model-cast-shadows": true,
        "model-emissive-strength": 1,
      },
    } as mapboxgl.LayerSpecification);
    m.addLayer({
      id: "ev-labels", type: "symbol", source: "events", slot: "top", minzoom: 17,
      layout: {
        "text-field": ["get", "title"],
        "text-size": 11,
        "text-offset": [0, 1.7],
        "text-anchor": "top",
        "text-optional": true,
        "symbol-sort-key": ["-", 0, ["get", "sort"]],
      },
      paint: {
        "text-color": sat ? "#ffffff" : "#1f2937",
        "text-halo-color": sat ? "rgba(0,0,0,.75)" : "#ffffff",
        "text-halo-width": 1.5,
        "text-opacity": dimmed,
        "text-emissive-strength": 1,
      },
    });
    ready.current = true;
    syncLayers();
    walkRef.current?.install(); // keep an active walk alive across Map/Satellite switches
  }

  useEffect(() => {
    if (!el.current || map.current || !TOKEN) return;
    const s = STYLES[styleRef.current];
    // Intro: start a little zoomed out over campus (top-down), then glide in and tilt onto you. Skipped when coming back from
    // Satellite (initialCamera set) or when the user prefers reduced motion.
    const reduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const intro = !!props.intro && !props.initialCamera && !reduceMotion;
    const m = new mapboxgl.Map({
      container: el.current,
      accessToken: TOKEN,
      style: s.url,
      config: { basemap: { ...s.config, lightPreset: props.light ?? "day", ...placeConfig(styleRef.current, props.layers.places) } },
      center: intro ? [props.me.lng, props.me.lat] : props.initialCamera ? [props.initialCamera.longitude, props.initialCamera.latitude] : USC_CENTER,
      zoom: intro ? 14.6 : props.initialCamera?.zoom ?? 16.4,
      minZoom: intro ? 14 : 15,
      maxZoom: 19.5,
      maxBounds: intro ? undefined : USC_BOUNDS,
      pitch: intro ? 0 : props.initialCamera?.pitch ?? 60,
      maxPitch: 72,
      bearing: intro ? 10 : props.initialCamera?.bearing ?? -20,
      antialias: true, // smooth edges on 3D buildings and the walking character
      performanceMetricsCollection: false,
      // required credits, kept small and together: the Mapbox logo (unaltered) next to a compact ⓘ attribution
      logoPosition: "bottom-right",
      attributionControl: false,
      // right-click drag and Ctrl + drag rotate and tilt; two fingers on a phone twist to rotate and drag to tilt
      dragRotate: true,
      touchZoomRotate: true,
      touchPitch: true,
    });
    map.current = m;
    m.touchZoomRotate.enableRotation();
    m.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
    // zoom, rotate and compass live in our own control column (MapControls), so Mapbox's own zoom buttons are not added
    const turnNeedle = () => { if (needle.current) needle.current.style.transform = `rotate(${-m.getBearing()}deg)`; };
    m.on("rotate", turnNeedle);
    turnNeedle();
    m.on("style.load", install);
    loadCampus().then(
      (c) => {
        campus.current = c;
        if (ready.current && map.current === m) installSpotlight(m, styleRef.current === "satellite", c, cb.current.light ?? "day", "alert-fill");
        // the neighborhood's buildings come after campus (a bigger file; campus shows first)
        loadArea().then((fc) => { area.current = fc; if (ready.current && map.current === m && styleRef.current !== "satellite") installArea(m, fc, cb.current.light ?? "day"); }, () => {});
      },
      () => { /* no campus data: fall back to the plain map */ },
    );
    if (intro) {
      // a gentle glide: zoom in, tilt into 3D and turn slightly, landing on where you are
      // start when the map is ready, but never wait more than 1.5 s after the style for slow tiles
      let started = false;
      const go = () => {
        if (started) return;
        started = true;
        const me = cb.current.me;
        m.easeTo({ center: [me.lng, me.lat], zoom: 16.6, pitch: 62, bearing: -20, duration: 3600, essential: true, easing: (t) => 1 - Math.pow(1 - t, 3) });
        m.once("moveend", () => {
          // lock the camera to campus only after landing
          m.setMinZoom(15);
          m.setMaxBounds(USC_BOUNDS);
          cb.current.onIntroDone?.();
        });
      };
      m.once("load", () => setTimeout(go, 300));
      m.once("style.load", () => setTimeout(go, 1500));
    }
    // trackpad two-finger click = right click: rotate the map instead of opening the browser menu
    el.current.addEventListener("contextmenu", (e) => e.preventDefault());

    // Trackpad orbit, like a 3D viewer: two-finger swipe sideways turns the map; with ⌥ held, swiping left/right turns
    // it and up/down tilts it. (Pinch and plain up/down swipes still zoom.) Runs in the capture phase so Mapbox's
    // scroll-zoom never sees these.
    const turned = () => {
      setRotateHint(false);
      try { localStorage.setItem("usclive.rotateHint", "1"); } catch { /* storage blocked */ }
    };
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || cb.current.walk) return; // pinch-zoom, or the walk owns the camera
      const ax = Math.abs(e.deltaX), ay = Math.abs(e.deltaY);
      if (e.altKey && ay > ax) {
        e.preventDefault(); e.stopPropagation();
        m.setPitch(Math.max(0, Math.min(72, m.getPitch() - e.deltaY * 0.2)));
        turned();
      } else if (e.altKey || ax > ay * 1.2) {
        e.preventDefault(); e.stopPropagation();
        m.setBearing(m.getBearing() - e.deltaX * 0.25);
        turned();
      }
    };
    el.current.addEventListener("wheel", onWheel, { capture: true, passive: false });
    // Safari reports the two-finger twist itself
    let twistFrom = 0;
    const onGestureStart = (e: Event) => { e.preventDefault(); twistFrom = m.getBearing(); };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      if (cb.current.walk) return;
      m.setBearing(twistFrom - (e as Event & { rotation: number }).rotation);
      turned();
    };
    el.current.addEventListener("gesturestart", onGestureStart);
    el.current.addEventListener("gesturechange", onGestureChange);
    // show "you can turn the map" once, after the intro has landed
    let seen = false;
    try { seen = !!localStorage.getItem("usclive.rotateHint"); } catch { /* storage blocked */ }
    const hintIn = seen ? undefined : setTimeout(() => setRotateHint(true), intro ? 5200 : 1800);
    const hintOut = seen ? undefined : setTimeout(() => setRotateHint(false), (intro ? 5200 : 1800) + 9000);
    const emit = () => {
      const c = m.getCenter();
      cb.current.onCamera?.({ longitude: c.lng, latitude: c.lat, zoom: m.getZoom(), pitch: m.getPitch(), bearing: m.getBearing() });
    };
    m.on("move", emit);
    m.on("move", tidyBubbles);
    emit();

    const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
    m.on("mouseenter", "ev-pins", () => (m.getCanvas().style.cursor = "pointer"));
    m.on("mouseleave", "ev-pins", () => (m.getCanvas().style.cursor = ""));
    m.on("mouseenter", "alerts-3d", () => (m.getCanvas().style.cursor = "pointer"));
    m.on("mouseleave", "alerts-3d", () => (m.getCanvas().style.cursor = ""));
    m.on("click", "alerts-3d", (e) => {
      const id = (e.features?.[0] as unknown as { properties?: { id?: string } } | undefined)?.properties?.id;
      const c = id ? cb.current.callouts.find((x) => x.id === id) : undefined;
      if (c) cb.current.onCallout(c);
    });
    m.on("mouseenter", "cams-3d", () => (m.getCanvas().style.cursor = "pointer"));
    m.on("mouseleave", "cams-3d", () => (m.getCanvas().style.cursor = ""));
    m.on("click", "cams-3d", (e) => {
      const id = (e.features?.[0] as unknown as { properties?: { id?: string } } | undefined)?.properties?.id;
      const c = id ? cb.current.callouts.find((x) => x.id === id) : undefined;
      if (c) cb.current.onCallout(c);
    });
    m.on("click", "ev-pins", (e) => {
      const id = (e.features?.[0] as unknown as { properties?: { id?: string } } | undefined)?.properties?.id;
      if (id) cb.current.onSelectEvent(id);
    });
    m.on("mousemove", "hot-hit", (e) => {
      const p = (e.features?.[0] as unknown as { properties?: { name: string; count: number; ratio: number; level: string } } | undefined)?.properties;
      if (!p) return;
      popup.setLngLat(e.lngLat).setHTML(`<b>${p.name}</b><br/>About ${p.count} people, ${p.level} (${Number(p.ratio).toFixed(1)}x usual)`).addTo(m);
    });
    m.on("mouseleave", "hot-hit", () => popup.remove());
    m.on("click", "hot-hit", (e) => {
      // events sit on top of crowd areas; let a pin click win
      if (m.queryRenderedFeatures(e.point, { layers: ["ev-pins"] }).length) return;
      const id = (e.features?.[0] as unknown as { properties?: { id?: string } } | undefined)?.properties?.id;
      if (id) cb.current.onSelectBuilding(id);
    });

    const bb = bubbles.current;
    const box = el.current;
    return () => {
      clearTimeout(hintIn); clearTimeout(hintOut);
      box.removeEventListener("wheel", onWheel, { capture: true });
      box.removeEventListener("gesturestart", onGestureStart);
      box.removeEventListener("gesturechange", onGestureChange);
      bb.clear(); m.remove(); map.current = null; ready.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // switch Map <-> Satellite (our layers are re-added on style.load)
  useEffect(() => {
    const m = map.current;
    if (!m || styleRef.current === props.mapStyle) return;
    styleRef.current = props.mapStyle;
    ready.current = false;
    const s = STYLES[props.mapStyle];
    m.setStyle(s.url, { config: { basemap: { ...s.config, lightPreset: cb.current.light ?? "day", ...placeConfig(props.mapStyle, cb.current.layers.places) } } } as unknown as Parameters<mapboxgl.Map["setStyle"]>[1]);
  }, [props.mapStyle]);

  // dawn / day / dusk / night
  useEffect(() => {
    const m = map.current;
    if (m && ready.current) applyLight(m, props.light ?? "day");
  }, [props.light]);

  // data -> sources (only touch the GPU when something actually changed)
  useEffect(() => {
    const g = hotspotGeo(props.hotspots, props.buildings);
    data.current.points = g.points;
    data.current.columns = g.columns;
    if (ready.current) { setSource("hot-points", g.points); setSource("hot-columns", g.columns); }
  }, [props.hotspots, props.buildings]);

  useEffect(() => {
    const fc = eventGeo(props.events, props.selectedEventId, props.highlightIds);
    data.current.events = fc;
    if (ready.current) setSource("events", fc);
  }, [props.events, props.selectedEventId, props.highlightIds]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(syncLayers, [props.layers]);

  useEffect(() => {
    const fc = alertGeo(props.alerts);
    data.current.alerts = fc;
    data.current.alertPts = alertPoints(props.alerts);
    if (ready.current) { setSource("alerts", fc); setSource("alert-pts", data.current.alertPts); }
  }, [props.alerts]);

  // webcams -> points for the 3D camera layer
  useEffect(() => {
    const fc: FC = {
      type: "FeatureCollection",
      features: props.callouts.filter((c) => c.kind === "webcam").map((c) => ({ type: "Feature", properties: { id: c.id }, geometry: { type: "Point", coordinates: [c.lng, c.lat] } })),
    };
    data.current.cams = fc;
    if (ready.current) setSource("cams", fc);
  }, [props.callouts]);

  // callout bubbles: a few DOM markers (diffed by id, so nothing re-mounts on refresh)
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const now = new Date();
    const keep = new Set<string>();
    for (const c of props.callouts) {
      keep.add(c.id);
      const html = calloutHTML(c, now);
      let b = bubbles.current.get(c.id);
      if (!b) {
        const el = document.createElement("div");
        el.className = `co co-${c.kind}`;
        el.addEventListener("click", (ev) => { ev.stopPropagation(); cb.current.onCallout(bubbles.current.get(c.id)?.c ?? c); });
        el.innerHTML = html;
        const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" }).setLngLat([c.lng, c.lat]).addTo(m);
        b = { m: marker, el, html, c };
        bubbles.current.set(c.id, b);
      } else {
        b.c = c;
        b.m.setLngLat([c.lng, c.lat]);
        if (b.html !== html) { b.el.innerHTML = html; b.html = html; }
      }
      if (c.intensity != null) b.el.style.setProperty("--intensity", String(c.intensity));
    }
    for (const [id, b] of bubbles.current) if (!keep.has(id)) { b.m.remove(); bubbles.current.delete(id); }
    tidyBubbles();
  }, [props.callouts]);

  // tick live game clocks every second; flash the bubble when the score changes
  useEffect(() => {
    const t = setInterval(() => {
      if (document.hidden) return; // nothing to tick while the tab is hidden
      const now = new Date();
      for (const b of bubbles.current.values()) {
        if (!b.c.game) continue;
        const html = calloutHTML(b.c, now);
        if (html === b.html) continue;
        const scoreOf = (h: string) => (h.match(/<b>\d+<\/b>/g) ?? []).join();
        const scored = scoreOf(html) !== scoreOf(b.html);
        b.el.innerHTML = html;
        b.html = html;
        if (scored) { b.el.classList.remove("co-bump"); void b.el.offsetWidth; b.el.classList.add("co-bump"); }
      }
    }, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!meMarker.current) {
      const d = document.createElement("div");
      d.className = "me-pin";
      d.title = "You";
      meMarker.current = new mapboxgl.Marker({ element: d }).setLngLat([props.me.lng, props.me.lat]).addTo(m);
    } else meMarker.current.setLngLat([props.me.lng, props.me.lat]);
  }, [props.me]);

  // side panel opened/closed: shift the visible center with padding (no canvas resize, no re-render)
  useEffect(() => {
    map.current?.easeTo({ padding: { left: props.leftInset ?? 0, right: 0, top: 110, bottom: 0 }, duration: 320 });
  }, [props.leftInset]);

  useEffect(() => {
    if (!props.focus || !map.current) return;
    map.current.flyTo({ center: [props.focus.lng, props.focus.lat], zoom: props.focus.zoom ?? 17.4, speed: 1.2, essential: true });
  }, [props.focus]);

  // start / stop the 3D walk
  const walkKey = props.walk?.key;
  useEffect(() => {
    const m = map.current;
    walkRef.current?.destroy();
    walkRef.current = null;
    const w = cb.current.walk;
    if (!m || !w) return;
    const me = cb.current.me;
    const guide = new WalkGuide(m, {
      from: { lng: me.lng, lat: me.lat, label: me.label },
      to: { lng: w.to.lng, lat: w.to.lat, name: w.to.name, code: w.to.code, id: w.to.id },
      token: TOKEN,
      onProgress: setWalkP,
    });
    walkRef.current = guide;
    const go = () => { if (walkRef.current === guide) guide.start(); };
    if (m.isStyleLoaded()) go();
    else m.once("idle", go);
    return () => {
      guide.destroy();
      if (walkRef.current === guide) walkRef.current = null;
      setWalkP(null);
      syncLayers(); // bring back pins/crowds the walk hid
    };
  }, [walkKey]);

  if (!TOKEN) {
    return <div className="absolute inset-0 flex items-center justify-center bg-surface text-sm text-muted">Add NEXT_PUBLIC_MAPBOX_TOKEN to .env.local to load the map.</div>;
  }
  return (
    <div className="absolute inset-0">
      <div ref={el} className="h-full w-full" />
      <WeatherEffects weather={props.weather} />
      <MapControls needle={needle}
        onRotate={(by) => { const m = map.current; if (m && !props.walk) m.easeTo({ bearing: m.getBearing() + by, duration: 500 }); }}
        onZoom={(by) => { const m = map.current; if (m && !props.walk) m.easeTo({ zoom: m.getZoom() + by, duration: 300 }); }}
        onNorth={() => { const m = map.current; if (m && !props.walk) m.easeTo({ bearing: 0, pitch: 60, duration: 600 }); }} />
      {rotateHint && !props.walk && (
        <div className="glass fade-in pointer-events-none absolute left-1/2 top-[calc(1.25rem+var(--sat))] z-10 -translate-x-1/2 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs text-foreground">
          Swipe sideways with two fingers to turn the map · <span className="text-muted">⌥ + swipe to tilt</span>
        </div>
      )}
      {walkP && props.walk && (
        <WalkHUD
          p={walkP}
          fromLabel={props.me.label}
          toName={props.walk.to.name}
          toCode={props.walk.to.code}
          onPause={() => walkRef.current?.pause()}
          onResume={() => walkRef.current?.resume()}
          onRestart={() => walkRef.current?.restart()}
          onClose={() => props.onWalkEnd()}
        />
      )}
    </div>
  );
}
