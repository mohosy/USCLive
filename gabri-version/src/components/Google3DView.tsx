"use client";

/**
 * Photorealistic 3D view (Google Map Tiles API, rendered with deck.gl).
 * Pins and labels are draped onto the 3D surface with deck.gl's terrain extension.
 */
import { Deck, FlyToInterpolator, type MapViewState, type PickingInfo } from "@deck.gl/core";
import { _TerrainExtension as TerrainExtension } from "@deck.gl/extensions";
import { Tile3DLayer } from "@deck.gl/geo-layers";
import { PathLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import type { Tileset3D } from "@loaders.gl/tiles";
import { RotateCcw, RotateCw, Compass } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CATEGORY_META, USC_CENTER } from "@/lib/campus";
import { isLive, type Building, type EventView, type Loc } from "@/lib/client-types";
import { bearing as bearingTo, fetchWalkRoute, Path, type Step } from "@/lib/walkRoute";
import type { Camera } from "./MapView";
import type { WalkPhase, WalkProgress } from "./walk/WalkGuide";
import WalkHUD from "./walk/WalkHUD";

/** Tiny pub/sub so the flat map can drive this camera while the 3D tiles load (no React re-renders per frame). */
export interface CameraBus { listeners: Set<(c: Camera) => void> }

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";
const TILESET = "https://tile.googleapis.com/v1/3dtiles/root.json";
const BOUNDS = { west: -118.2995, south: 34.0115, east: -118.2715, north: 34.0305 };

const hex = (h: string, a = 255): [number, number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), a];

interface Props {
  events: EventView[];
  buildings: Building[];
  me: Loc;
  selectedEventId: string | null;
  highlightIds: string[] | null;
  focus: { lat: number; lng: number; zoom?: number; key: number } | null;
  onSelectEvent: (id: string) => void;
  /** camera to start from (shared with the flat map) */
  initialCamera: Camera | null;
  /** while not ready, follow this camera */
  follow: CameraBus;
  onReady: () => void;
  onCamera: (c: Camera) => void;
  /** walking tour to this building (same trigger as Mo's tour on the flat map) */
  walk: { to: Building; key: number } | null;
  onWalkEnd: () => void;
}

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
}

interface Pin { id: string; position: [number, number]; color: [number, number, number, number]; radius: number; selected: boolean; title: string }

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
  const [error, setError] = useState<string | null>(null);
  const cb = useRef(props);
  useEffect(() => { cb.current = props; });
  const walk = useRef<WalkState | null>(null);
  const [walkP, setWalkP] = useState<WalkProgress | null>(null);

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
        color: hex((CATEGORY_META[e.category] ?? CATEGORY_META.social).color, dim ? 70 : 255),
        radius: (isLive(e, now) ? 10 : 8) + (e.id === p.selectedEventId ? 4 : 0),
        selected: e.id === p.selectedEventId,
        title: e.title.length > 28 ? `${e.title.slice(0, 27)}…` : e.title,
      });
    }
    const terrain = new TerrainExtension();
    const w = walk.current;
    const walkLayers = w ? walkLayersFor(w, terrain) : [];
    return [
      new Tile3DLayer({
        id: "google-3d",
        data: TILESET,
        // maximumScreenSpaceError 20 (default 16): slightly coarser detail -> far fewer tiles, sharp sooner
        loadOptions: { fetch: { headers: { "X-GOOG-API-KEY": KEY } }, tileset: { maximumScreenSpaceError: 20 } },
        operation: "terrain+draw",
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
      }),
      // invisible hover targets, one per building
      new ScatterplotLayer<Building>({
        id: "building-hit",
        data: p.buildings,
        getPosition: (b) => [b.lng, b.lat],
        getRadius: 22,
        radiusUnits: "pixels",
        getFillColor: [0, 0, 0, 0],
        pickable: true,
        billboard: true,
        extensions: [terrain],
        parameters: { depthCompare: "always" },
      }),
      ...walkLayers,
      new ScatterplotLayer<Pin>({
        id: "pins",
        data: w ? [] : pins,
        getPosition: (d) => d.position,
        getFillColor: (d) => d.color,
        getLineColor: (d) => (d.selected ? [153, 0, 0, 255] : [255, 255, 255, 255]),
        getRadius: (d) => d.radius,
        radiusUnits: "pixels",
        lineWidthUnits: "pixels",
        getLineWidth: (d) => (d.selected ? 3 : 2),
        stroked: true,
        billboard: true,
        pickable: true,
        extensions: [terrain],
        parameters: { depthCompare: "always" },
        updateTriggers: { getLineColor: p.selectedEventId, getLineWidth: p.selectedEventId },
      }),
      // names only for the hovered building, plus the main buildings once you zoom in close
      new TextLayer<Building>({
        id: "building-names",
        data: p.buildings.filter((b) => b.id === hovered.current || (zoomedIn.current && !b.minor)),
        getPosition: (b) => [b.lng, b.lat],
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
        extensions: [terrain],
      }),
      new ScatterplotLayer<Loc>({
        id: "me",
        data: [p.me],
        getPosition: (d) => [d.lng, d.lat],
        getFillColor: [37, 99, 235, 255],
        getLineColor: [255, 255, 255, 255],
        getRadius: 7,
        radiusUnits: "pixels",
        lineWidthUnits: "pixels",
        getLineWidth: 3,
        stroked: true,
        billboard: true,
        extensions: [terrain],
        parameters: { depthCompare: "always" },
      }),
    ];
  }

  function walkLayersFor(w: WalkState, terrain: InstanceType<typeof TerrainExtension>) {
    const here = w.path.at(w.dist);
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 250);
    const toLL = (p: { lng: number; lat: number }): [number, number] => [p.lng, p.lat];
    return [
      new PathLayer({ id: "walk-casing", data: [{ path: w.path.pts.map(toLL) }], getPath: (d: { path: [number, number][] }) => d.path, getColor: [255, 255, 255, 230], getWidth: 11, widthUnits: "pixels", capRounded: true, jointRounded: true, extensions: [terrain], parameters: { depthCompare: "always" } }),
      new PathLayer({ id: "walk-route", data: [{ path: w.path.pts.map(toLL) }], getPath: (d: { path: [number, number][] }) => d.path, getColor: [153, 0, 0, 255], getWidth: 6, widthUnits: "pixels", capRounded: true, jointRounded: true, extensions: [terrain], parameters: { depthCompare: "always" } }),
      new PathLayer({ id: "walk-done", data: [{ path: w.path.until(w.dist).map(toLL) }], getPath: (d: { path: [number, number][] }) => d.path, getColor: [255, 204, 0, 255], getWidth: 6, widthUnits: "pixels", capRounded: true, jointRounded: true, extensions: [terrain], parameters: { depthCompare: "always" }, updateTriggers: { getPath: w.dist } }),
      new ScatterplotLayer({ id: "walk-halo", data: [here], getPosition: toLL, getFillColor: [255, 204, 0, Math.round(70 + 60 * pulse)], getRadius: 16 + 8 * pulse, radiusUnits: "pixels", billboard: true, extensions: [terrain], parameters: { depthCompare: "always" }, updateTriggers: { getRadius: pulse, getFillColor: pulse } }),
      new ScatterplotLayer({ id: "walk-dot", data: [here], getPosition: toLL, getFillColor: [255, 204, 0, 255], getLineColor: [153, 0, 0, 255], getRadius: 9, radiusUnits: "pixels", stroked: true, getLineWidth: 3, lineWidthUnits: "pixels", billboard: true, extensions: [terrain], parameters: { depthCompare: "always" } }),
      new TextLayer({ id: "walk-dest", data: [w.to], getPosition: (b: Building) => [b.lng, b.lat], getText: (b: Building) => b.name, getSize: 14, getColor: [255, 255, 255, 255], getBackgroundColor: [153, 0, 0, 235], background: true, backgroundPadding: [8, 4], fontWeight: 600, fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif", getPixelOffset: [0, -30], billboard: true, extensions: [terrain], parameters: { depthCompare: "always" } }),
    ];
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
      if (w.dist >= w.path.length) w.phase = "arrived";
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
    deck.current?.setProps({ layers: layers() });
    if (Math.floor(now / 120) !== Math.floor((now - dt * 1000) / 120)) emitWalk(w);
    w.raf = requestAnimationFrame(walkFrame);
  }

  async function startWalk(to: Building, key: number) {
    stopWalk();
    const me = cb.current.me;
    setWalkP({ phase: "loading", traveledM: 0, totalM: 0, realMinutes: 0 });
    const r = await fetchWalkRoute(me, to, process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "");
    if (cb.current.walk?.key !== key) return; // cancelled meanwhile
    const path = new Path(r.pts);
    const first = bearingTo(path.at(0), path.at(30));
    const now = performance.now();
    walk.current = {
      path, steps: r.steps, landmarks: path.landmarks(to.id), fallback: r.fallback, to,
      dist: 0, speed: path.length / Math.min(40, Math.max(20, path.length / 20)), phase: "overview", bearing: first, last: now, raf: 0, started: now,
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
    deck.current?.setProps({ controller: { touchRotate: true, inertia: 250 }, layers: layers() });
  }

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
    if (ready.current) cb.current.onCamera({ longitude, latitude, zoom, pitch, bearing });
  }

  function rotate(by: number) {
    setView({ ...viewState.current, bearing: (viewState.current.bearing ?? 0) + by, transitionDuration: 500 } as MapViewState);
  }
  function resetNorth() {
    setView({ ...viewState.current, bearing: 0, pitch: 60, transitionDuration: 600 } as MapViewState);
  }

  // follow the flat map's camera until the 3D campus is ready; give up waiting after 15s
  useEffect(() => {
    const bus = props.follow;
    const fn = (c: Camera) => { if (!ready.current) setView({ ...viewState.current, ...c }); };
    bus?.listeners?.add(fn);
    const t = setTimeout(markReady, 15_000);
    return () => { bus?.listeners?.delete(fn); clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.follow]);

  useEffect(() => {
    if (!el.current || !KEY || deck.current) return;
    el.current.addEventListener("contextmenu", (e) => e.preventDefault());
    deck.current = new Deck({
      parent: el.current,
      viewState: viewState.current,
      controller: { touchRotate: true, inertia: 250 },
      onViewStateChange: ({ viewState: v }) => setView(v as MapViewState),
      onClick: (info: PickingInfo<Pin>) => { if (info.layer?.id === "pins" && info.object) cb.current.onSelectEvent(info.object.id); },
      getCursor: ({ isHovering, isDragging }) => (isDragging ? "grabbing" : isHovering ? "pointer" : "grab"),
      getTooltip: (info: PickingInfo<Pin>) => (info.layer?.id === "pins" && info.object ? { text: info.object.title } : null),
      onHover: (info: PickingInfo) => {
        const id = info.layer?.id === "building-hit" ? (info.object as Building | undefined)?.id ?? null : null;
        if (id !== hovered.current) { hovered.current = id; deck.current?.setProps({ layers: layers() }); }
      },
      layers: layers(),
    });
    return () => { deck.current?.finalize(); deck.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    deck.current?.setProps({ layers: layers() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.events, props.buildings, props.me, props.selectedEventId, props.highlightIds]);

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
      <div className="pointer-events-none absolute bottom-2 right-14 z-10 max-w-[60%] truncate rounded bg-white/80 px-2 py-0.5 text-[10px] text-gray-700">
        <span className="font-semibold">Google</span>{credits ? ` · ${credits}` : ""}
      </div>
      <div className="absolute bottom-10 right-3 z-10 flex flex-col overflow-hidden rounded-lg border border-line bg-white shadow-sm">
        <button onClick={() => rotate(-45)} className="p-2 text-foreground hover:bg-surface" title="Rotate left"><RotateCcw size={16} /></button>
        <button onClick={resetNorth} className="border-y border-line p-2 text-foreground hover:bg-surface" title="Reset view"><Compass size={16} /></button>
        <button onClick={() => rotate(45)} className="p-2 text-foreground hover:bg-surface" title="Rotate right"><RotateCw size={16} /></button>
      </div>
      <div className="pointer-events-none absolute bottom-10 left-3 z-10 rounded-md bg-white/85 px-2 py-1 text-[11px] text-gray-700">Drag to move · two-finger click and drag to rotate · scroll to zoom</div>
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
