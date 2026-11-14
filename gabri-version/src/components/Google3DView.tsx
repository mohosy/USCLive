"use client";

/**
 * Photorealistic 3D view (Google Map Tiles API, rendered with deck.gl).
 * Pins and labels are draped onto the 3D surface with deck.gl's terrain extension.
 */
import { Deck, FlyToInterpolator, type MapViewState, type PickingInfo } from "@deck.gl/core";
import { _TerrainExtension as TerrainExtension } from "@deck.gl/extensions";
import { Tile3DLayer } from "@deck.gl/geo-layers";
import { ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import type { Tileset3D } from "@loaders.gl/tiles";
import { RotateCcw, RotateCw, Compass } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CATEGORY_META, USC_CENTER } from "@/lib/campus";
import { isLive, type Building, type EventView, type Loc } from "@/lib/client-types";
import type { Camera } from "./MapView";

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
      new ScatterplotLayer<Pin>({
        id: "pins",
        data: pins,
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
      {error && <div className="absolute left-1/2 top-16 z-10 -translate-x-1/2 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs text-red-700 shadow">{error}</div>}
    </div>
  );
}
