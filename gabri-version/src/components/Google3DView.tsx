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
import { useEffect, useRef, useState } from "react";
import { CATEGORY_META, USC_CENTER } from "@/lib/campus";
import { isLive, type Building, type EventView, type Loc } from "@/lib/client-types";

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
  const viewState = useRef<MapViewState>({ longitude: USC_CENTER[0], latitude: USC_CENTER[1], zoom: 16.6, pitch: 60, bearing: -20, minZoom: 15, maxZoom: 20, maxPitch: 80 });
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
        loadOptions: { fetch: { headers: { "X-GOOG-API-KEY": KEY } } },
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
            return selected;
          };
        },
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
      new TextLayer<Building>({
        id: "building-names",
        data: p.buildings,
        getPosition: (b) => [b.lng, b.lat],
        getText: (b) => b.name,
        getSize: 13,
        getColor: [255, 255, 255, 255],
        outlineWidth: 3,
        outlineColor: [0, 0, 0, 200],
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
        fontWeight: 600,
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

  useEffect(() => {
    if (!el.current || !KEY || deck.current) return;
    deck.current = new Deck({
      parent: el.current,
      viewState: viewState.current,
      controller: { touchRotate: true, inertia: 250 },
      onViewStateChange: ({ viewState: v }) => {
        viewState.current = clamp(v as MapViewState);
        deck.current?.setProps({ viewState: viewState.current });
      },
      onClick: (info: PickingInfo<Pin>) => { if (info.layer?.id === "pins" && info.object) cb.current.onSelectEvent(info.object.id); },
      getCursor: ({ isHovering, isDragging }) => (isDragging ? "grabbing" : isHovering ? "pointer" : "grab"),
      getTooltip: (info: PickingInfo<Pin>) => (info.layer?.id === "pins" && info.object ? { text: info.object.title } : null),
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
    viewState.current = { ...viewState.current, longitude: props.focus.lng, latitude: props.focus.lat, zoom: props.focus.zoom ?? 18, pitch: 60, transitionDuration: 1200, transitionInterpolator: new FlyToInterpolator() } as MapViewState;
    deck.current.setProps({ viewState: viewState.current });
  }, [props.focus]);

  if (!KEY) {
    return <div className="absolute inset-0 flex items-center justify-center bg-surface text-sm text-muted">Add NEXT_PUBLIC_GOOGLE_MAPS_KEY to .env.local for the 3D view.</div>;
  }
  return (
    <div className="absolute inset-0 bg-[#cfd8e3]">
      <div ref={el} className="absolute inset-0" />
      <div className="pointer-events-none absolute bottom-2 right-14 z-10 max-w-[60%] truncate rounded bg-white/80 px-2 py-0.5 text-[10px] text-gray-700">
        <span className="font-semibold">Google</span>{credits ? ` · ${credits}` : ""}
      </div>
      {error && <div className="absolute left-1/2 top-16 z-10 -translate-x-1/2 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs text-red-700 shadow">{error}</div>}
    </div>
  );
}
