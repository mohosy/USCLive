"use client";
import { Compass, RotateCcw, RotateCw } from "lucide-react";

/**
 * Photorealistic 3D view (Google Map Tiles API, rendered with deck.gl).
 * Pins and labels are draped onto the 3D surface with deck.gl's terrain extension.
 */
import { Deck, FlyToInterpolator, type MapViewState, type PickingInfo } from "@deck.gl/core";
import { _TerrainExtension as TerrainExtension } from "@deck.gl/extensions";
import { Tile3DLayer, TileLayer } from "@deck.gl/geo-layers";
import { BitmapLayer, IconLayer, PathLayer, PolygonLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { iconCanvas, iconKey, ICON_PX } from "@/lib/eventIcons";
import { alertStyle } from "@/lib/alertStyle";
import { ScenegraphLayer } from "@deck.gl/mesh-layers";
import type { Tileset3D } from "@loaders.gl/tiles";
import type { CampusWeather } from "@/lib/weather";
import WeatherEffects from "./weather/WeatherEffects";
import { useEffect, useRef, useState } from "react";
import { CATEGORY_META, USC_CENTER } from "@/lib/campus";
import { calloutHTML } from "@/lib/calloutHtml";
import type { Callout } from "@/lib/callouts";
import { declutter } from "@/lib/declutter";
import { busyLine, hotspotFor } from "@/lib/hotspots";
import { isLive, type Building, type EventView, type Hotspot, type Loc, type SafetyAlert } from "@/lib/client-types";
import { bearing as bearingTo, fetchWalkRoute, Path, type Step } from "@/lib/walkRoute";
import type { Camera } from "./MapView";
import type { WalkPhase, WalkProgress } from "./walk/WalkGuide";
import WalkHUD from "./walk/WalkHUD";
import { trojanGlbUrl } from "./walk/trojanModel";
import { MeMotion } from "@/lib/meMotion";
import type { MeLive } from "./MapView";

/** Tiny pub/sub so the flat map can drive this camera while the 3D tiles load (no React re-renders per frame). */
export interface CameraBus { listeners: Set<(c: Camera) => void> }

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";
const TILESET = "https://tile.googleapis.com/v1/3dtiles/root.json";

/** Google 2D satellite tiles need a session token (Map Tiles API, same key). Fetched once per page. */
let sessionPromise: Promise<string | null> | null = null;
function satelliteSession() {
  sessionPromise ??= fetch(`https://tile.googleapis.com/v1/createSession?key=${KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mapType: "satellite", language: "en-US", region: "US" }),
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((d: { session?: string } | null) => d?.session ?? null)
    .catch(() => null);
  return sessionPromise;
}
/** Phones: coarser photoreal tiles and 1x pixels (Google's 3D tiles are heavy on mobile GPUs and memory). */
const PHONE = typeof window !== "undefined" && window.matchMedia("(max-width: 900px), (pointer: coarse)").matches;
const BOUNDS = { west: -118.3035, south: 34.0045, east: -118.2712, north: 34.0382 }; // same as the Explore map

/** Same neighborhood as the Explore map: full detail inside, washed out beyond (draped on the 3D tiles). */
const AREA = { south: 34.0065, west: -118.3012, north: 34.0362, east: -118.2735 };
const FADE_RING: [number, number][][] = [
  [[AREA.west - 0.15, AREA.south - 0.15], [AREA.east + 0.15, AREA.south - 0.15], [AREA.east + 0.15, AREA.north + 0.15], [AREA.west - 0.15, AREA.north + 0.15], [AREA.west - 0.15, AREA.south - 0.15]],
  [[AREA.west, AREA.south], [AREA.west, AREA.north], [AREA.east, AREA.north], [AREA.east, AREA.south], [AREA.west, AREA.south]],
];
/** USC's outline (UPC + Village), from the same file the Explore map uses. */
let outlinePromise: Promise<[number, number][][]> | null = null;
const loadOutline = () =>
  (outlinePromise ??= fetch("/data/usc-campus.json").then((r) => r.json()).then((d: { campus: { geometry: { type: string; coordinates: number[][][] | number[][][][] } } }) => {
    const g = d.campus.geometry;
    const polys = (g.type === "MultiPolygon" ? g.coordinates : [g.coordinates]) as [number, number][][][];
    return polys.map((p) => p[0]); // outer rings
  }).catch((e) => { outlinePromise = null; throw e; }));

/** Walker avatar clips (from the procedural Trojan, exported to .glb at runtime). */
const WALKER_CLIPS = ["Idle", "Walk", "Wave", "Happy"] as const;
const LEVEL_RGB: Record<string, [number, number, number]> = { quiet: [22, 163, 74], normal: [202, 138, 4], busy: [234, 88, 12], packed: [220, 38, 38] };

/** Height of USC's ground in Google's 3D tiles as deck.gl sees it (meters); calibrated against draped layers. */
const GROUND_Z = -30;

const hex = (h: string, a = 255): [number, number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), a];

interface Props {
  weather: CampusWeather;
  /** false while it pre-loads hidden behind Explore: no ground measuring */
  active?: boolean;
  events: EventView[];
  buildings: Building[];
  me: Loc;
  selectedEventId: string | null;
  highlightIds: string[] | null;
  focus: { lat: number; lng: number; zoom?: number; key: number } | null;
  onSelectEvent: (id: string) => void;
  /** a building's name was clicked: open it (how busy, what's on) */
  onSelectBuilding?: (id: string) => void;
  /** camera to start from (shared with the flat map) */
  initialCamera: Camera | null;
  /** while not ready, follow this camera */
  follow: CameraBus;
  onReady: () => void;
  onCamera: (c: Camera) => void;
  /** walking tour to this building (same trigger as Mo's tour on the flat map) */
  walk: { to: Building; key: number } | null;
  onWalkEnd: () => void;
  callouts: Callout[];
  alerts: SafetyAlert[];
  hotspots: Hotspot[];
  showHeat: boolean;
  onCallout: (c: Callout) => void;
  /** live facts about your location, read every frame: accuracy in meters and the phone's compass heading */
  meLive?: { current: MeLive };
  /** your Trojan was tapped */
  onMe?: () => void;
}

const ME_ACCURACY_M = 10; // the circle's radius when the accuracy is not known
const prefersStill = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

interface WalkState {
  path: Path;
  steps: Step[];
  landmarks: { name: string; atM: number }[];
  fallback: boolean;
  to: Building;
  dist: number;
  speed: number; // m/s of the fast-forwarded preview
  phase: WalkPhase;
  bearing: number;
  last: number;
  raf: number;
  started: number;
  arrivedAt: number;
  /** deck timeline time (s) at arrival, so the wave plays from its first frame */
  waveStart: number;
}

interface Pin { id: string; position: [number, number]; color: [number, number, number, number]; radius: number; selected: boolean; title: string; icon: string; size: number; dim: boolean }

/** the 3D film camera that stands at every live webcam (same model as the Explore map) */
const CAM_MODEL = "/models/film-camera.glb";
const BEACON_MODEL = "/models/dps-beacon.glb";
const iconUrls = new Map<string, string>();
const iconUrl = (key: string) => { let u = iconUrls.get(key); if (!u) { u = iconCanvas(key).toDataURL(); iconUrls.set(key, u); } return u; };

const byIdCache = new WeakMap<Building[], Record<string, Building>>();
function BYID(list: Building[]) {
  let m = byIdCache.get(list);
  if (!m) { m = Object.fromEntries(list.map((b) => [b.id, b])); byIdCache.set(list, m); }
  return m;
}

function clamp(v: MapViewState): MapViewState {
  return {
    ...v,
    longitude: Math.min(BOUNDS.east, Math.max(BOUNDS.west, v.longitude)),
    latitude: Math.min(BOUNDS.north, Math.max(BOUNDS.south, v.latitude)),
  };
}

export default function Google3DView(props: Props) {
  const el = useRef<HTMLDivElement>(null);
  const deck = useRef<Deck | null>(null);
  const viewState = useRef<MapViewState>({
    longitude: props.initialCamera?.longitude ?? USC_CENTER[0],
    latitude: props.initialCamera?.latitude ?? USC_CENTER[1],
    zoom: props.initialCamera?.zoom ?? 16.6,
    pitch: props.initialCamera?.pitch ?? 60,
    bearing: props.initialCamera?.bearing ?? -20,
    minZoom: 15, maxZoom: 20, maxPitch: 80,
  });
  const ready = useRef(false);
  const hovered = useRef<string | null>(null);
  const ZOOM_LABELS = 18.2;
  const zoomedIn = useRef((props.initialCamera?.zoom ?? 16.6) >= ZOOM_LABELS);
  const [credits, setCredits] = useState("");
  const session = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cb = useRef(props);
  useEffect(() => { cb.current = props; });
  const walk = useRef<WalkState | null>(null);
  // height of the photoreal ground (meters), measured by picking the 3D tiles; campus is flat so one value works
  const groundZ = useRef<number | null>(null);
  // surface height right under each bubble / the walker (measured by picking the 3D tiles)
  const zAt = useRef(new Map<string, number>());
  const overlay = useRef<HTMLDivElement>(null);
  const needle = useRef<SVGSVGElement>(null); // the compass needle in the control column
  const bubbles = useRef(new Map<string, { el: HTMLDivElement; html: string; c: Callout }>());
  const [walkP, setWalkP] = useState<WalkProgress | null>(null);
  // the Trojan walker as a .glb blob URL (null until built; falls back to a gold dot)
  const walkerUrl = useRef<string | null>(null);
  // "you are here" is your Trojan (the same one as in Explore): where it stands between two location fixes, and which way it faces
  const meMotion = useRef<MeMotion | null>(null);
  const meModelFailed = useRef(false); // the 3D model could not be built: a plain dot marks you instead
  const mePulse = useRef(0.5);

  function layers() {
    const p = cb.current;
    const now = new Date();
    const per = new Map<string, number>();
    const pins: Pin[] = [];
    for (const e of p.events) {
      if (e.lat == null || e.lng == null) continue;
      const i = per.get(e.buildingId) ?? 0;
      per.set(e.buildingId, i + 1);
      const r = i === 0 ? 0 : 0.00007 + i * 0.000015;
      const dim = p.highlightIds ? !p.highlightIds.includes(e.id) : false;
      pins.push({
        id: e.id,
        position: [e.lng + Math.cos(i * 2.4) * r * 1.2, e.lat + Math.sin(i * 2.4) * r],
        color: hex((CATEGORY_META[e.category] ?? CATEGORY_META.student).color, dim ? 70 : 255),
        radius: (isLive(e, now) ? 10 : 8) + (e.id === p.selectedEventId ? 4 : 0),
        selected: e.id === p.selectedEventId,
        title: e.title.length > 28 ? `${e.title.slice(0, 27)}…` : e.title,
        icon: iconKey(e.category, e.id === p.selectedEventId, e.freeFood),
        size: ICON_PX * (0.85 + Math.min(0.3, Math.sqrt(e.attendeeCount) * 0.02)) * (e.id === p.selectedEventId ? 1.15 : 1),
        dim,
      });
    }
    const terrain = new TerrainExtension();
    // points sit at the measured ground height (cheap); only areas (zones, heat, route) are draped (expensive)
    const gz = groundZ.current ?? GROUND_Z;
    const w = walk.current;
    const walkLayers = w ? walkLayersFor(w, terrain) : [];
    return [
      // flat Google satellite underneath: loads in a second, then the 3D campus streams in on top of it
      ...(session.current ? [new TileLayer<ImageBitmap>({
        id: "google-2d",
        data: `https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${session.current}&key=${KEY}`,
        // only over the neighborhood and close up: Google bills every 2D tile (the 3D tiles cover the rest)
        extent: [BOUNDS.west, BOUNDS.south, BOUNDS.east, BOUNDS.north],
        minZoom: 14,
        maxZoom: PHONE ? 18 : 19,
        tileSize: 256,
        maxRequests: 16,
        onViewportLoad: () => markReady(),
        renderSubLayers: (sp) => {
          const [[w, so], [e, n]] = sp.tile.boundingBox;
          const z = gz - 2; // just under the 3D surface so the 3D mesh wins wherever it has loaded
          return new BitmapLayer({ id: sp.id, image: sp.data, bounds: [[w, so, z], [w, n, z], [e, n, z], [e, so, z]] });
        },
        updateTriggers: { renderSubLayers: Math.round(gz) },
      })] : []),
      tileLayer(),
      // invisible hover targets, one per building
      new ScatterplotLayer<Building>({
        id: "building-hit",
        data: p.buildings,
        getPosition: (b) => [b.lng, b.lat, gz],
        getRadius: 22,
        radiusUnits: "pixels",
        getFillColor: [0, 0, 0, 0],
        pickable: true,
        billboard: true,
        
        parameters: { depthCompare: "always" },
      }),
      new ScatterplotLayer<Hotspot & { lng: number; lat: number }>({
        id: "heat",
        data: p.showHeat && !w ? p.hotspots.filter((h) => !h.suppressed && BYID(p.buildings)[h.buildingId]).map((h) => ({ ...h, lng: BYID(p.buildings)[h.buildingId].lng, lat: BYID(p.buildings)[h.buildingId].lat })) : [],
        getPosition: (h) => [h.lng, h.lat],
        getRadius: (h) => 18 + Math.min(40, h.count * 0.08),
        radiusUnits: "meters",
        getFillColor: (h) => [...(LEVEL_RGB[h.level] ?? [120, 120, 120]), h.level === "quiet" || h.level === "normal" ? 0 : 55] as [number, number, number, number],
        extensions: [terrain],
      }),
      // beyond the neighborhood: washed out, like the Explore map
      new PolygonLayer({
        id: "area-fade", data: [{ polygon: FADE_RING }], getPolygon: (d: { polygon: [number, number][][] }) => d.polygon,
        getFillColor: [247, 245, 242, 150], stroked: false, extensions: [terrain],
      }),
      // USC's cardinal outline: a soft glow plus a crisp line
      new PathLayer<[number, number][]>({
        id: "usc-edge-glow", data: outline.current, getPath: (r) => r, getColor: [153, 0, 0, 45], getWidth: 9, widthUnits: "pixels", jointRounded: true, extensions: [terrain],
      }),
      new PathLayer<[number, number][]>({
        id: "usc-edge", data: outline.current, getPath: (r) => r, getColor: [153, 0, 0, 220], getWidth: 2.5, widthUnits: "pixels", jointRounded: true, extensions: [terrain],
      }),
      new ScatterplotLayer<SafetyAlert>({
        id: "alert-zones",
        data: p.alerts,
        getPosition: (a) => [a.lng, a.lat],
        getRadius: (a) => alertStyle(a).radiusM,
        radiusUnits: "meters",
        getFillColor: (a) => [...alertStyle(a).rgb, Math.round(alertStyle(a).fill * 255)] as [number, number, number, number],
        getLineColor: (a) => [...alertStyle(a).rgb, Math.round(alertStyle(a).line * 255)] as [number, number, number, number],
        stroked: true,
        getLineWidth: 2,
        lineWidthUnits: "pixels",
        extensions: [terrain],
      }),
      ...walkLayers,
      // event type icons (one sprite per type, GPU-drawn)
      new IconLayer<Pin>({
        id: "pins",
        data: w ? [] : pins,
        getPosition: (d) => [d.position[0], d.position[1], gz],
        getIcon: (d) => ({ id: d.icon, url: iconUrl(d.icon), width: ICON_PX * 2, height: ICON_PX * 2, mask: false }),
        getSize: (d) => d.size,
        sizeUnits: "pixels",
        getColor: (d) => [255, 255, 255, d.dim ? 70 : 255],
        billboard: true,
        pickable: true,
        parameters: { depthCompare: "always" },
        updateTriggers: { getIcon: p.selectedEventId, getSize: p.selectedEventId },
      }),
      // DPS alerts: a red police beacon standing in the zone
      new ScenegraphLayer<SafetyAlert>({
        id: "alerts-3d",
        data: w ? [] : p.alerts,
        scenegraph: BEACON_MODEL,
        getPosition: (a) => [a.lng, a.lat, (zAt.current.get(`al:${a.id}`) ?? gz) + 4], // the beacon light floats a little above its zone
        getOrientation: [0, 0, 90],
        sizeScale: 400,
        sizeMinPixels: 36,
        sizeMaxPixels: 48,
        _lighting: "pbr",
        pickable: true,
        updateTriggers: { getPosition: camZ.current },
      }),
      // live webcams: a 3D film camera standing on the spot
      new ScenegraphLayer<Callout>({
        id: "cams-3d",
        data: w ? [] : p.callouts.filter((c) => c.kind === "webcam"),
        scenegraph: CAM_MODEL,
        getPosition: (c) => [c.lng, c.lat, zAt.current.get(c.id) ?? gz],
        getOrientation: (c) => [0, 90 - (c.heading ?? 180), 90], // deck turns counter-clockwise: lens (east) -> the camera's heading
        // about the same size on screen at every zoom (~30-40 px tall)
        sizeScale: 280,
        sizeMinPixels: 28,
        sizeMaxPixels: 36,
        _lighting: "pbr",
        pickable: true,
        updateTriggers: { getPosition: camZ.current },
      }),
      // names only for the hovered building, plus the main buildings once you zoom in close
      new TextLayer<Building>({
        id: "building-names",
        data: p.buildings.filter((b) => b.id === hovered.current || (zoomedIn.current && !b.minor)),
        getPosition: (b) => [b.lng, b.lat, gz],
        getText: (b) => b.name,
        getSize: (b) => (b.id === hovered.current ? 13 : 11),
        getColor: [255, 255, 255, 255],
        outlineWidth: 1.5,
        outlineColor: [0, 0, 0, 170],
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
        fontWeight: 500,
        updateTriggers: { getSize: hovered.current },
        fontSettings: { sdf: true },
        parameters: { depthCompare: "always" },
        getPixelOffset: [0, -22],
        billboard: true,
        
      }),
      ...meLayers(gz),
    ];
  }

  // the photoreal tile layer is created once and reused (rebuilding it on every hover was wasted work)
  const tiles = useRef<Tile3DLayer | null>(null);
  const tileGen = useRef(0); // bumps when a tile loads
  const camZ = useRef(0); // bumps when a webcam's ground height changes
  const measuredGen = useRef(-1);
  const lastReset = useRef(0);
  const groundDirty = useRef(true);
  const settled = useRef(new Set<string>()); // bubble ids whose ground height is known
  const tries = useRef(new Map<string, number>()); // looks spent on each bubble since the last reset
  const lastMove = useRef(0); // when the camera last moved (no measuring while it does)
  const placedFor = useRef(""); // the camera the bubbles were last positioned for
  const bubblesDirty = useRef(true); // a bubble was added, removed or got a new height
  const activeRef = useRef(props.active !== false); // false while pre-loading behind Explore
  const outline = useRef<[number, number][][]>([]);
  // shown at last: start exactly where the Explore map was looking
  useEffect(() => {
    activeRef.current = props.active !== false;
    if (props.active && props.initialCamera) setView({ ...viewState.current, ...props.initialCamera });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.active]);
  function tileLayer() {
    tiles.current ??= new Tile3DLayer({
        id: "google-3d",
        pickable: true, // lets us measure the ground height under the bubbles
        data: TILESET,
        // maximumScreenSpaceError 24 (default 16): a bit less detail -> far fewer tiles, sharp much sooner
        loadOptions: { fetch: { headers: { "X-GOOG-API-KEY": KEY } }, tileset: { maximumScreenSpaceError: PHONE ? 40 : 24, maximumMemoryUsage: 256, memoryAdjustedScreenSpaceError: true } },
        operation: "terrain+draw",
        onTileLoad: () => { tileGen.current++; },
        onTileError: () => setError("Google 3D tiles failed to load. Check that the Map Tiles API is enabled for this key."),
        onTilesetLoad: (tileset: Tileset3D) => {
          // Google requires showing the data providers for the tiles on screen
          tileset.options.onTraversalComplete = (selected) => {
            const set = new Set<string>();
            for (const t of selected) {
              const c = (t.content as { gltf?: { asset?: { copyright?: string } } } | undefined)?.gltf?.asset?.copyright;
              c?.split(";").forEach((s) => s.trim() && set.add(s.trim()));
            }
            setCredits(Array.from(set).join("; "));
            if (!ready.current && tileset.isLoaded()) markReady();
            return selected;
          };
        },
      });
    return tiles.current;
  }

  /** You on the map: a soft pulsing accuracy circle and, standing on it, your Trojan. A tour's guide stands in for you during a walk. */
  function meLayers(gz: number) {
    if (walk.current) return [];
    const p = cb.current;
    const mo = (meMotion.current ??= new MeMotion({ lat: p.me.lat, lng: p.me.lng }));
    const here = { lng: mo.pos.lng, lat: mo.pos.lat, heading: mo.heading };
    const still = prefersStill();
    const acc = Math.min(p.meLive?.current.accuracyM ?? ME_ACCURACY_M, 60);
    const pulse = still ? 0.5 : mePulse.current;
    const clip = mo.moving ? "Walk" : "Idle";
    return [
      new ScatterplotLayer({
        id: "me-accuracy", data: [here], getPosition: (d: { lng: number; lat: number }) => [d.lng, d.lat, gz],
        getRadius: acc * (1 + 0.06 * pulse), radiusUnits: "meters", radiusMinPixels: 22,
        getFillColor: [59, 130, 246, Math.round(70 + 40 * pulse)], getLineColor: [96, 165, 250, Math.round(190 + 60 * pulse)],
        stroked: true, getLineWidth: 1.5, lineWidthUnits: "pixels",
        updateTriggers: { getPosition: [here.lng, here.lat], getRadius: [acc, pulse], getFillColor: pulse, getLineColor: pulse },
        parameters: { depthCompare: "always" },
      }),
      ...(walkerUrl.current ? [new ScenegraphLayer({
        id: "me-trojan", data: [here], scenegraph: walkerUrl.current, pickable: true,
        getPosition: (d: { lng: number; lat: number }) => [d.lng, d.lat, gz],
        getOrientation: (d: { heading: number }) => [0, 180 - d.heading, 90],
        // the same size rule as play mode: 2.4 m tall, never under 24 px on screen
        sizeScale: 1.2, sizeMinPixels: 12,
        _animations: Object.fromEntries(WALKER_CLIPS.map((c) => [c, { playing: !still && c === clip, speed: c === "Walk" ? 1.4 : 1 }])),
        _lighting: "pbr",
        updateTriggers: { getPosition: [here.lng, here.lat], getOrientation: Math.round(here.heading), _animations: [clip, still] },
        parameters: { depthCompare: "always" },
      })] : meModelFailed.current ? [
        new ScatterplotLayer({ id: "me-dot", data: [here], pickable: true, getPosition: (d: { lng: number; lat: number }) => [d.lng, d.lat, gz], getFillColor: [37, 99, 235, 255], getLineColor: [255, 255, 255, 255], getRadius: 7, radiusUnits: "pixels", stroked: true, getLineWidth: 3, lineWidthUnits: "pixels", billboard: true, updateTriggers: { getPosition: [here.lng, here.lat] }, parameters: { depthCompare: "always" } }),
      ] : []),
    ];
  }

  function walkLayersFor(w: WalkState, terrain: InstanceType<typeof TerrainExtension>) {
    const here = w.path.at(w.dist);
    const gz = groundZ.current ?? GROUND_Z;
    const pulse = 0.5 + 0.5 * Math.sin(w.last / 250); // w.last = time of the current animation frame
    const toLL = (p: { lng: number; lat: number }): [number, number] => [p.lng, p.lat];
    return [
      new PathLayer({ id: "walk-casing", data: [{ path: w.path.pts.map(toLL) }], getPath: (d: { path: [number, number][] }) => d.path, getColor: [255, 255, 255, 230], getWidth: 11, widthUnits: "pixels", capRounded: true, jointRounded: true, extensions: [terrain], parameters: { depthCompare: "always" } }),
      new PathLayer({ id: "walk-route", data: [{ path: w.path.pts.map(toLL) }], getPath: (d: { path: [number, number][] }) => d.path, getColor: [153, 0, 0, 255], getWidth: 6, widthUnits: "pixels", capRounded: true, jointRounded: true, extensions: [terrain], parameters: { depthCompare: "always" } }),
      new PathLayer({ id: "walk-done", data: [{ path: w.path.until(w.dist).map(toLL) }], getPath: (d: { path: [number, number][] }) => d.path, getColor: [255, 204, 0, 255], getWidth: 6, widthUnits: "pixels", capRounded: true, jointRounded: true, extensions: [terrain], parameters: { depthCompare: "always" }, updateTriggers: { getPath: w.dist } }),
      new ScatterplotLayer({ id: "walk-halo", data: [here], getPosition: (p: { lng: number; lat: number }) => [p.lng, p.lat, zAt.current.get("walker") ?? gz], getFillColor: [255, 204, 0, Math.round(50 + 40 * pulse)], getRadius: 14 + 6 * pulse, radiusUnits: "pixels", billboard: true,  parameters: { depthCompare: "always" }, updateTriggers: { getRadius: pulse, getFillColor: pulse } }),
      // the walker: the Trojan mascot, a bit larger than life so it reads from rooftop height.
      // On arrival he turns to the camera, hops, waves and grins.
      ...(walkerUrl.current ? [new ScenegraphLayer({
        id: "walker",
        data: [{ ...here, bearing: w.phase === "arrived" ? w.bearing + 180 : w.bearing }],
        scenegraph: walkerUrl.current,
        getPosition: (d: { lng: number; lat: number }) => [d.lng, d.lat, zAt.current.get("walker") ?? groundZ.current ?? GROUND_Z],
        getOrientation: (d: { bearing: number }) => [0, 180 - d.bearing, 90],
        sizeScale: 8,
        _animations: Object.fromEntries(WALKER_CLIPS.map((c) => [c, { playing: c === walkerClip(w), speed: c === "Walk" ? 1.4 : 1, ...(c === "Wave" ? { startTime: w.waveStart } : {}) }])),
        _lighting: "pbr",
        updateTriggers: { getPosition: w.dist, getOrientation: Math.round(w.bearing), _animations: walkerClip(w) },
        parameters: { depthCompare: "always" },
      })] : [
        new ScatterplotLayer({ id: "walk-dot", data: [here], getPosition: (p: { lng: number; lat: number }) => [p.lng, p.lat, zAt.current.get("walker") ?? gz], getFillColor: [255, 204, 0, 255], getLineColor: [153, 0, 0, 255], getRadius: 9, radiusUnits: "pixels", stroked: true, getLineWidth: 3, lineWidthUnits: "pixels", billboard: true,  parameters: { depthCompare: "always" } }),
      ]),
      new TextLayer({ id: "walk-dest", data: [w.to], getPosition: (b: Building) => [b.lng, b.lat, gz], getText: (b: Building) => b.name, getSize: 14, getColor: [255, 255, 255, 255], getBackgroundColor: [153, 0, 0, 235], background: true, backgroundPadding: [8, 4], fontWeight: 600, fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif", getPixelOffset: [0, -30], billboard: true,  parameters: { depthCompare: "always" } }),
    ];
  }

  function walkerClip(w: WalkState): (typeof WALKER_CLIPS)[number] {
    if (w.phase === "walking") return "Walk";
    if (w.phase === "arrived") return performance.now() - w.arrivedAt < 3000 ? "Wave" : "Happy";
    return "Idle";
  }

  function emitWalk(w: WalkState) {
    const step = [...w.steps].reverse().find((s) => s.startM <= w.dist);
    const nextStep = w.steps.find((s) => s.startM > w.dist);
    const passing = w.landmarks.find((l) => Math.abs(l.atM - w.dist) < 35)?.name;
    setWalkP({ phase: w.phase, traveledM: w.dist, totalM: w.path.length, realMinutes: Math.max(1, Math.round(w.path.length / 80)), step, nextStep, passing, fallback: w.fallback });
  }

  function walkFrame(now: number) {
    const w = walk.current;
    if (!w) return;
    const dt = Math.min(0.1, (now - w.last) / 1000);
    w.last = now;
    if (w.phase === "overview" && now - w.started > 2600) w.phase = "walking";
    if (w.phase === "walking") {
      w.dist = Math.min(w.path.length, w.dist + dt * w.speed);
      if (w.dist >= w.path.length) {
        w.phase = "arrived";
        w.arrivedAt = now;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        w.waveStart = ((deck.current as any)?.animationLoop?.timeline?.getTime?.() ?? 0) / 1000;
      }
      const here = w.path.at(w.dist);
      const ahead = w.path.at(w.dist + 30);
      const target = w.dist < w.path.length - 5 ? bearingTo(here, ahead) : w.bearing;
      const diff = ((target - w.bearing + 540) % 360) - 180;
      w.bearing = (w.bearing + diff * Math.min(1, dt * 2.5) + 360) % 360;
      // chase camera, low and close, looking down the path (Immersive View style)
      // (Google's scans get blurry at street level, so stay ~a rooftop above it)
      const look = w.path.at(w.dist + 40);
      viewState.current = { ...viewState.current, longitude: look.lng, latitude: look.lat, zoom: 17.9, pitch: 58, bearing: w.bearing, transitionDuration: 0 } as MapViewState;
      deck.current?.setProps({ viewState: viewState.current });
    } else if (w.phase === "arrived") {
      // slow orbit around the destination
      w.bearing = (w.bearing + dt * 10) % 360;
      viewState.current = { ...viewState.current, longitude: w.to.lng, latitude: w.to.lat, zoom: 18, pitch: 58, bearing: w.bearing, transitionDuration: 0 } as MapViewState;
      deck.current?.setProps({ viewState: viewState.current });
    }
    // keep the walker on the photoreal ground
    if (Math.floor(now / 250) !== Math.floor((now - dt * 1000) / 250)) {
      const pos = w.path.at(w.dist);
      const z = surfaceZ(pos.lng, pos.lat, zAt.current.get("walker") ?? groundZ.current ?? GROUND_Z);
      if (z != null) zAt.current.set("walker", z);
    }
    deck.current?.setProps({ layers: layers() });
    if (Math.floor(now / 120) !== Math.floor((now - dt * 1000) / 120)) emitWalk(w);
    w.raf = requestAnimationFrame(walkFrame);
  }

  async function startWalk(to: Building, key: number) {
    stopWalk();
    const at = meMotion.current?.pos; // from your Trojan, wherever it is standing right now
    const me = at ? { ...cb.current.me, lat: at.lat, lng: at.lng } : cb.current.me;
    setWalkP({ phase: "loading", traveledM: 0, totalM: 0, realMinutes: 0 });
    const [r, glb] = await Promise.all([
      fetchWalkRoute(me, to, process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ""),
      trojanGlbUrl().catch(() => null),
    ]);
    walkerUrl.current = glb;
    if (cb.current.walk?.key !== key) return; // cancelled meanwhile
    const path = new Path(r.pts);
    const first = bearingTo(path.at(0), path.at(30));
    // eslint-disable-next-line react-hooks/purity -- runs from an effect, not during render
    const now = performance.now();
    walk.current = {
      path, steps: r.steps, landmarks: path.landmarks(to.id), fallback: r.fallback, to,
      dist: 0, speed: path.length / Math.min(40, Math.max(20, path.length / 20)), phase: "overview", bearing: first, last: now, raf: 0, started: now, arrivedAt: 0, waveStart: 0,
    };
    deck.current?.setProps({ controller: false });
    // establishing shot over the whole route
    const mid = path.at(path.length / 2);
    const zoom = Math.min(18, Math.max(16, 17.6 - Math.log2(Math.max(path.length, 200) / 300)));
    setView({ ...viewState.current, longitude: mid.lng, latitude: mid.lat, zoom, pitch: 50, bearing: first, transitionDuration: 1800, transitionInterpolator: new FlyToInterpolator() } as MapViewState);
    walk.current.raf = requestAnimationFrame(walkFrame);
    emitWalk(walk.current);
  }

  function stopWalk() {
    if (walk.current) cancelAnimationFrame(walk.current.raf);
    walk.current = null;
    setWalkP(null);
    deck.current?.setProps({ controller: { dragRotate: true, touchRotate: true, inertia: 250 }, layers: layers() });
  }

  /** Measure the photoreal ground height by picking a few open spaces (fields, the quad). */
  /** deck.gl's viewport, or null while it's still starting up (getViewports throws before init). */
  function viewport() {
    try { return deck.current?.getViewports()?.[0] ?? null; } catch { return null; }
  }

  function sampleGround() {
    const d = deck.current;
    const vp = viewport();
    if (!d || !vp) return;
    const spots: [number, number][] = [[-118.287864, 34.022038], [-118.283156, 34.020943], [-118.285465, 34.020536], [-118.2845, 34.0195]];
    const zs: number[] = [];
    for (const [lng, lat] of spots) {
      const [x, y] = vp.project([lng, lat, groundZ.current ?? GROUND_Z]);
      if (x < 0 || y < 0 || x > vp.width || y > vp.height) continue;
      let info: PickingInfo | null = null;
      try { info = d.pickObject({ x, y, radius: 0, layerIds: ["google-3d"], unproject3D: true }); } catch { /* not ready */ }
      const z = info?.coordinate?.[2];
      if (typeof z === "number" && isFinite(z)) zs.push(z);
    }
    if (zs.length) groundZ.current = Math.min(...zs);
  }

  /** Height of the 3D surface at (lng, lat): pick along the view ray a few times until it settles. */
  function surfaceZ(lng: number, lat: number, start: number): number | null {
    const d = deck.current;
    const vp = viewport();
    if (!d || !vp) return null;
    let z = start;
    for (let i = 0; i < 4; i++) {
      const [x, y] = vp.project([lng, lat, z]);
      if (x < 0 || y < 0 || x > vp.width || y > vp.height) return null;
      let hit: number | undefined;
      try { hit = d.pickObject({ x, y, radius: 0, layerIds: ["google-3d"], unproject3D: true })?.coordinate?.[2]; } catch { return null; }
      if (typeof hit !== "number" || !isFinite(hit)) return null;
      if (Math.abs(hit - z) < 0.5) return hit;
      z = hit;
    }
    return z;
  }

  /**
   * Measure the ground under bubbles. Every pick re-renders the whole 3D scene, so we only measure a spot
   * until its height settles, and again only after sharper tiles have streamed in. Idle = zero picks.
   */
  /* eslint-disable react-hooks/purity -- these two run from a timer and after frames, never during render */
  function measureBubbles() {
    if (document.hidden || !activeRef.current) return;
    if (performance.now() - lastMove.current < 600) return; // each pick re-renders the scene: never while the camera is moving
    const t = Date.now();
    if (tileGen.current !== measuredGen.current && t - lastReset.current > 3000) {
      settled.current.clear(); // new detail loaded: heights may have changed
      tries.current.clear();
      measuredGen.current = tileGen.current;
      lastReset.current = t;
      groundDirty.current = true;
    }
    if (groundDirty.current) { sampleGround(); groundDirty.current = false; }
    let picks = 0;
    for (const b of bubbles.current.values()) {
      if (picks >= 4) break; // spread the work over several ticks
      if (b.el.style.display === "none" || settled.current.has(b.c.id)) continue;
      const prev = zAt.current.get(b.c.id);
      const z = surfaceZ(b.c.lng, b.c.lat, prev ?? groundZ.current ?? GROUND_Z);
      picks++;
      if (z == null) continue; // off screen: try again when it's in view
      const n = (tries.current.get(b.c.id) ?? 0) + 1;
      tries.current.set(b.c.id, n);
      zAt.current.set(b.c.id, z);
      if (prev == null || Math.abs(prev - z) >= 0.5) bubblesDirty.current = true;
      if ((b.c.kind === "webcam" || b.c.kind === "alert" || b.c.kind === "alertmini") && (prev == null || Math.abs(prev - z) > 0.5)) { camZ.current++; deck.current?.setProps({ layers: layers() }); }
      // done when two looks agree. A spot on a roof edge can flip forever, so three looks is the limit:
      // without it this timer kept re-rendering the scene 8-12 times a second while nothing moved.
      if ((prev != null && Math.abs(prev - z) < 0.5) || n >= 3) settled.current.add(b.c.id);
    }
    if (bubblesDirty.current) positionBubbles(); // heights changed: move the bubbles now (DOM only, no redraw)
  }

  /**
   * Keep the HTML bubbles pinned to their spots on the 3D scene. Called after every frame, but it only
   * touches the page when the camera actually moved or a bubble changed.
   */
  function positionBubbles() {
    const vp = viewport();
    if (!vp) return;
    const cam = `${vp.viewProjectionMatrix.join()}|${vp.width}x${vp.height}|${groundZ.current}`; // changes exactly when the view does
    if (cam !== placedFor.current) lastMove.current = performance.now();
    else if (!bubblesDirty.current) return; // nothing moved
    placedFor.current = cam;
    bubblesDirty.current = false;
    const shown = [];
    for (const b of bubbles.current.values()) {
      const z = zAt.current.get(b.c.id) ?? groundZ.current ?? GROUND_Z;
      const [x, y] = vp.project([b.c.lng, b.c.lat, z]);
      const off = x < -50 || y < -50 || x > vp.width + 50 || y > vp.height + 50;
      b.el.style.display = off ? "none" : "";
      b.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      if (!off) shown.push({ el: b.el, kind: b.c.kind, x, y });
    }
    declutter(shown); // no overlaps: the more important bubble wins
  }
  /* eslint-enable react-hooks/purity */

  function markReady() {
    if (ready.current) return;
    ready.current = true;
    cb.current.onReady();
  }

  function setView(v: MapViewState) {
    viewState.current = clamp(v);
    deck.current?.setProps({ viewState: viewState.current });
    // crossing the zoom threshold shows/hides the building names
    const z = (viewState.current.zoom ?? 0) >= ZOOM_LABELS;
    if (z !== zoomedIn.current) { zoomedIn.current = z; deck.current?.setProps({ layers: layers() }); }
    const { longitude, latitude, zoom, pitch = 0, bearing = 0 } = viewState.current;
    if (needle.current) needle.current.style.transform = `rotate(${-bearing}deg)`;
    if (ready.current) cb.current.onCamera({ longitude, latitude, zoom, pitch, bearing });
  }

  // the control column (the walk owns the camera while it plays)
  function rotate(by: number) {
    if (walk.current) return;
    setView({ ...viewState.current, bearing: (viewState.current.bearing ?? 0) + by, transitionDuration: 500 } as MapViewState);
  }
  function zoomBy(by: number) {
    if (walk.current) return;
    setView({ ...viewState.current, zoom: Math.min(20, Math.max(15, (viewState.current.zoom ?? 16.6) + by)), transitionDuration: 300 } as MapViewState);
  }
  function resetNorth() {
    if (walk.current) return;
    setView({ ...viewState.current, bearing: 0, pitch: 60, transitionDuration: 600 } as MapViewState);
  }

  // follow the flat map's camera until the 3D campus is ready (not after: kept loaded behind Explore, it must not fetch tiles for every pan)
  useEffect(() => {
    const bus = props.follow;
    const fn = (c: Camera) => { if (!ready.current) setView({ ...viewState.current, ...c }); };
    bus?.listeners?.add(fn);
    const t = setTimeout(markReady, 15_000);
    const mb = setInterval(measureBubbles, 1000);
    return () => { bus?.listeners?.delete(fn); clearTimeout(t); clearInterval(mb); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.follow]);

  useEffect(() => {
    if (!el.current || !KEY || deck.current) return;
    const host = el.current;
    host.addEventListener("contextmenu", (e) => e.preventDefault());
    // Trackpad orbit, same as the Explore map: two-finger swipe sideways turns the view; with ⌥ held, swiping
    // left/right turns it and up/down tilts it. Capture phase, so deck.gl's scroll-zoom never sees these.
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || walk.current) return; // pinch-zoom, or the walk owns the camera
      const ax = Math.abs(e.deltaX), ay = Math.abs(e.deltaY);
      const v = viewState.current;
      if (e.altKey && ay > ax) {
        e.preventDefault(); e.stopPropagation();
        setView({ ...v, pitch: Math.max(0, Math.min(80, (v.pitch ?? 0) - e.deltaY * 0.2)), transitionDuration: 0 } as MapViewState);
      } else if (e.altKey || ax > ay * 1.2) {
        e.preventDefault(); e.stopPropagation();
        setView({ ...v, bearing: (v.bearing ?? 0) - e.deltaX * 0.25, transitionDuration: 0 } as MapViewState);
      }
    };
    host.addEventListener("wheel", onWheel, { capture: true, passive: false });
    // Safari reports the two-finger trackpad twist itself
    let twistFrom = 0;
    const onGestureStart = (e: Event) => { e.preventDefault(); twistFrom = viewState.current.bearing ?? 0; };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      if (walk.current) return;
      setView({ ...viewState.current, bearing: twistFrom - (e as Event & { rotation: number }).rotation, transitionDuration: 0 } as MapViewState);
    };
    host.addEventListener("gesturestart", onGestureStart);
    host.addEventListener("gesturechange", onGestureChange);
    // Create the engine on the next tick: React dev mode mounts twice, and a Deck finalized before it
    // finished starting keeps rendering as an orphan. Deferring means only one Deck is ever created.
    let created: Deck | null = null;
    const t = setTimeout(() => {
    created = deck.current = new Deck({
      parent: host,
      // retina at 2-3x renders 4-9x the pixels; 1.5x looks the same on campus imagery and is much smoother
      useDevicePixels: Math.min(typeof window !== "undefined" ? window.devicePixelRatio : 1, PHONE ? 1 : 1.5),
      viewState: viewState.current,
      // right-click drag and Ctrl + drag rotate and tilt; two fingers on a phone twist to rotate
      controller: { dragRotate: true, touchRotate: true, inertia: 250 },
      onViewStateChange: ({ viewState: v }) => setView(v as MapViewState),
      onClick: (info: PickingInfo) => {
        if (info.layer?.id === "me-trojan" || info.layer?.id === "me-dot") { cb.current.onMe?.(); return; }
        if (info.layer?.id === "pins" && info.object) cb.current.onSelectEvent((info.object as Pin).id);
        if (info.layer?.id === "building-hit" && info.object) cb.current.onSelectBuilding?.((info.object as Building).id);
        if (info.layer?.id === "cams-3d" && info.object) cb.current.onCallout(info.object as Callout);
        if (info.layer?.id === "alerts-3d" && info.object) { const a = info.object as SafetyAlert; cb.current.onCallout({ id: `al:${a.id}`, kind: "alert", lng: a.lng, lat: a.lat, eyebrow: "", title: a.title }); }
      },
      onAfterRender: positionBubbles,
      getCursor: ({ isHovering, isDragging }) => (isDragging ? "grabbing" : isHovering ? "pointer" : "grab"),
      getTooltip: (info: PickingInfo) => {
        if (info.layer?.id === "pins" && info.object) return { text: (info.object as Pin).title };
        // any building, main or minor: the same "how busy" line as the Explore map
        if (info.layer?.id === "building-hit" && info.object) {
          const b = info.object as Building;
          const h = cb.current.hotspots.find((x) => x.buildingId === b.id) ?? hotspotFor(b, cb.current.events, new Date());
          return { text: `${b.name}\n${busyLine(h)}` };
        }
        return null;
      },
      onHover: (info: PickingInfo) => {
        const id = info.layer?.id === "building-hit" ? (info.object as Building | undefined)?.id ?? null : null;
        if (id !== hovered.current) { hovered.current = id; deck.current?.setProps({ layers: layers() }); }
      },
      layers: layers(),
    });
    satelliteSession().then((sess) => { session.current = sess; created?.setProps({ layers: layers() }); });
    loadOutline().then((rings) => { outline.current = rings; created?.setProps({ layers: layers() }); }, () => {});
    }, 0);
    return () => {
      clearTimeout(t);
      host.removeEventListener("wheel", onWheel, { capture: true });
      host.removeEventListener("gesturestart", onGestureStart);
      host.removeEventListener("gesturechange", onGestureChange);
      created?.finalize();
      if (deck.current === created) deck.current = null;
      host.querySelectorAll("canvas").forEach((c) => c.remove());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // rebuild the 3D layers only when what they draw actually changed (a 20s refresh usually changes nothing)
  const drawn = useRef("");
  useEffect(() => {
    const sig = JSON.stringify([props.events, props.me, props.selectedEventId, props.highlightIds, props.alerts, props.hotspots, props.showHeat]);
    if (sig === drawn.current && props.buildings === lastBuildings.current) return;
    drawn.current = sig;
    lastBuildings.current = props.buildings;
    deck.current?.setProps({ layers: layers() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.events, props.buildings, props.me, props.selectedEventId, props.highlightIds, props.alerts, props.hotspots, props.showHeat]);
  const lastBuildings = useRef<Building[] | null>(null);

  // your Trojan: built once this view is in use; a new location walks it there (it appears there with reduced motion)
  const active = props.active !== false;
  useEffect(() => {
    if (!active || walkerUrl.current || meModelFailed.current) return;
    let gone = false;
    trojanGlbUrl().then((url) => { if (!gone) { walkerUrl.current = url; deck.current?.setProps({ layers: layers() }); } },
      () => { if (!gone) { meModelFailed.current = true; deck.current?.setProps({ layers: layers() }); } });
    return () => { gone = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  useEffect(() => {
    const mo = (meMotion.current ??= new MeMotion({ lat: props.me.lat, lng: props.me.lng }));
    mo.setTarget({ lat: props.me.lat, lng: props.me.lng }, performance.now(), prefersStill() || !active);
    deck.current?.setProps({ layers: layers() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.me, active]);
  useEffect(() => {
    if (!active || prefersStill()) return;
    let raf = 0, lastDraw = 0, lastHeading = -1;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const mo = meMotion.current;
      if (!mo || walk.current || !deck.current) return; // during a tour the walk's own loop draws
      mo.setCompass(cb.current.meLive?.current.compass ?? null);
      mo.setFallbackHeading((viewState.current.bearing ?? 0) + 180); // nothing to go on yet: face the camera
      const busy = mo.step(now);
      const turned = Math.abs(mo.heading - lastHeading) > 0.5;
      // walking or turning redraws every frame; standing still only the circle's slow pulse does (10 times a second)
      if (!busy && !turned && now - lastDraw < 100) return;
      lastDraw = now; lastHeading = mo.heading;
      mePulse.current = 0.5 + 0.5 * Math.sin(now / 450);
      deck.current.setProps({ layers: layers() });
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // HTML bubbles (same as Explore): create/update/remove by id, then position on every frame
  useEffect(() => {
    const root = overlay.current;
    if (!root) return;
    const now = new Date();
    const keep = new Set<string>();
    for (const c of walk.current ? [] : props.callouts) {
      keep.add(c.id);
      const html = calloutHTML(c, now);
      let b = bubbles.current.get(c.id);
      if (!b) {
        const el = document.createElement("div");
        el.className = `co co-${c.kind} absolute left-0 top-0 pointer-events-auto`;
        el.addEventListener("click", (ev) => { ev.stopPropagation(); cb.current.onCallout(bubbles.current.get(c.id)?.c ?? c); });
        el.innerHTML = html;
        root.appendChild(el);
        b = { el, html, c };
        bubbles.current.set(c.id, b);
      } else {
        b.c = c;
        if (b.html !== html) { b.el.innerHTML = html; b.html = html; }
      }
      if (c.intensity != null) b.el.style.setProperty("--intensity", String(c.intensity));
    }
    for (const [id, b] of bubbles.current) if (!keep.has(id)) { b.el.remove(); bubbles.current.delete(id); }
    bubblesDirty.current = true;
    positionBubbles();
    deck.current?.setProps({ layers: layers() }); // webcam models follow the Cams filter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.callouts, walkP?.phase]);

  // live game clocks: once a second, and not at all while the tab is hidden
  useEffect(() => {
    const t = setInterval(() => {
      if (document.hidden) return;
      const now = new Date();
      for (const b of bubbles.current.values()) {
        if (!b.c.game) continue;
        const html = calloutHTML(b.c, now);
        if (html !== b.html) { b.el.innerHTML = html; b.html = html; }
      }
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // start / stop the 3D walk when the search bar asks for directions
  const walkKey = props.walk?.key;
  useEffect(() => {
    const w = cb.current.walk;
    if (w && deck.current) startWalk(w.to, w.key);
    else stopWalk();
    return () => { if (walk.current) cancelAnimationFrame(walk.current.raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walkKey]);

  useEffect(() => {
    if (!props.focus || !deck.current) return;
    setView({ ...viewState.current, longitude: props.focus.lng, latitude: props.focus.lat, zoom: props.focus.zoom ?? 18, pitch: 60, transitionDuration: 1200, transitionInterpolator: new FlyToInterpolator() } as MapViewState);
  }, [props.focus]);

  if (!KEY) {
    return <div className="absolute inset-0 flex items-center justify-center bg-surface text-sm text-muted">Add NEXT_PUBLIC_GOOGLE_MAPS_KEY to .env.local for the 3D view.</div>;
  }
  return (
    <div className="absolute inset-0">
      <div ref={el} className="absolute inset-0" />
      <WeatherEffects weather={props.weather} active={props.active !== false} />
      <div ref={overlay} className="pointer-events-none absolute inset-0 z-[2] overflow-hidden" />
      <div className="satellite-credit pointer-events-none absolute bottom-3 right-14 z-10 max-w-[60%] truncate rounded bg-white/80 px-2 py-0.5 text-[10px] text-gray-700">
        <span className="font-semibold">Google</span>{credits ? ` · ${credits}` : ""}
      </div>
      <div className="absolute bottom-10 right-3 z-10 flex flex-col overflow-hidden rounded-lg border border-line bg-white shadow-sm">
        <button onClick={() => rotate(-45)} className="p-2 text-foreground hover:bg-surface" title="Rotate left" aria-label="Rotate left"><RotateCcw size={16} /></button>
        <button onClick={resetNorth} className="border-y border-line p-2 text-foreground hover:bg-surface" title="Reset view" aria-label="Face north and reset the tilt"><Compass size={16} /></button>
        <button onClick={() => rotate(45)} className="p-2 text-foreground hover:bg-surface" title="Rotate right" aria-label="Rotate right"><RotateCw size={16} /></button>
      </div>
      <div className="glass pointer-events-none absolute left-1/2 top-5 z-10 -translate-x-1/2 rounded-full px-3 py-1 text-[11px] text-muted max-md:hidden">Drag to move · two-finger click and drag to rotate · scroll to zoom</div>
      {walkP && props.walk && (
        <WalkHUD
          p={walkP}
          fromLabel={props.me.label}
          toName={props.walk.to.name}
          toCode={props.walk.to.code}
          onPause={() => { if (walk.current && walk.current.phase === "walking") { walk.current.phase = "paused"; emitWalk(walk.current); } }}
          onResume={() => { if (walk.current && walk.current.phase === "paused") { walk.current.phase = "walking"; emitWalk(walk.current); } }}
          onRestart={() => { if (walk.current) { walk.current.dist = 0; walk.current.phase = "walking"; emitWalk(walk.current); } }}
          onClose={() => props.onWalkEnd()}
        />
      )}
      {error && <div className="absolute left-1/2 top-16 z-10 -translate-x-1/2 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs text-red-700 shadow">{error}</div>}
    </div>
  );
}
