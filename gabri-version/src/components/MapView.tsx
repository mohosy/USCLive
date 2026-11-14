"use client";

import mapboxgl from "mapbox-gl";
import { useEffect, useRef } from "react";
import { CATEGORY_META, USC_CENTER } from "@/lib/campus";
import { isLive, type Building, type EventView, type Hotspot, type Loc } from "@/lib/client-types";
import { LEVEL_COLOR } from "./ui";

// Mapbox Standard: detailed 3D buildings, landmark models, trees and lighting.
const STYLE = "mapbox://styles/mapbox/standard";
const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

export interface MapLayers { events: boolean; hotspots: boolean; columns: boolean }

interface Props {
  events: EventView[];
  hotspots: Hotspot[];
  buildings: Building[];
  me: Loc;
  layers: MapLayers;
  selectedEventId: string | null;
  highlightIds: string[] | null; // when set, everything else is dimmed
  focus: { lat: number; lng: number; zoom?: number; key: number } | null;
  onSelectEvent: (id: string) => void;
  onSelectBuilding: (id: string) => void;
}

function circlePolygon(lng: number, lat: number, radiusM: number, steps = 24) {
  const coords: [number, number][] = [];
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    coords.push([lng + Math.cos(a) * dLng, lat + Math.sin(a) * dLat]);
  }
  return coords;
}

function hotspotGeo(hotspots: Hotspot[], buildings: Building[]) {
  const byId = Object.fromEntries(buildings.map((b) => [b.id, b]));
  const visible = hotspots.filter((h) => !h.suppressed && byId[h.buildingId]);
  return {
    points: {
      type: "FeatureCollection" as const,
      features: visible.map((h) => ({
        type: "Feature" as const,
        properties: { id: h.buildingId, weight: Math.min(1, h.count / 400), ratio: h.ratio, level: h.level, color: LEVEL_COLOR[h.level], count: h.count, name: byId[h.buildingId].name },
        geometry: { type: "Point" as const, coordinates: [byId[h.buildingId].lng, byId[h.buildingId].lat] },
      })),
    },
    columns: {
      type: "FeatureCollection" as const,
      features: visible.map((h) => ({
        type: "Feature" as const,
        properties: { id: h.buildingId, height: 15 + Math.min(90, h.count * 0.12 * Math.max(0.6, h.ratio)), color: LEVEL_COLOR[h.level] },
        geometry: { type: "Polygon" as const, coordinates: [circlePolygon(byId[h.buildingId].lng, byId[h.buildingId].lat, 7)] },
      })),
    },
  };
}

export default function MapView(props: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const ready = useRef(false);
  const markers = useRef(new Map<string, { m: mapboxgl.Marker; el: HTMLDivElement }>());
  const meMarker = useRef<mapboxgl.Marker | null>(null);
  const cb = useRef(props);
  useEffect(() => { cb.current = props; });

  useEffect(() => {
    if (!el.current || map.current || !TOKEN) return;
    const m = new mapboxgl.Map({
      container: el.current,
      accessToken: TOKEN,
      style: STYLE,
      config: {
        basemap: {
          lightPreset: "day",
          show3dObjects: true,
          showPointOfInterestLabels: true,
          showTransitLabels: false,
        },
      },
      center: USC_CENTER,
      zoom: 16.4,
      pitch: 60,
      bearing: -20,
      antialias: true,
    });
    map.current = m;
    m.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "bottom-right");

    m.on("style.load", () => {
      m.addSource("hot-points", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addSource("hot-columns", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      // "middle" slot: above roads/ground, below 3D buildings and labels
      m.addLayer({
        id: "hot-heat", type: "heatmap", source: "hot-points", slot: "middle",
        paint: {
          "heatmap-weight": ["get", "weight"],
          "heatmap-intensity": 1,
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 14, 20, 17, 70],
          "heatmap-opacity": 0.45,
          "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(255,255,255,0)", 0.3, "rgba(250,204,21,.5)", 0.65, "rgba(234,88,12,.6)", 1, "rgba(220,38,38,.75)"],
        },
      });
      m.addLayer({
        id: "hot-columns", type: "fill-extrusion", source: "hot-columns", slot: "top",
        layout: { visibility: "none" },
        paint: { "fill-extrusion-color": ["get", "color"], "fill-extrusion-height": ["get", "height"], "fill-extrusion-base": 0, "fill-extrusion-opacity": 0.75, "fill-extrusion-emissive-strength": 0.8 },
      });
      // invisible hit area: crowds show as the heat glow, hover/click gives the numbers
      m.addLayer({
        id: "hot-dots", type: "circle", source: "hot-points", slot: "top",
        paint: { "circle-radius": 16, "circle-color": "#000", "circle-opacity": 0 },
      });
      const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
      const onHot = (e: mapboxgl.MapMouseEvent) => {
        const f = e.features?.[0];
        if (!f) return;
        m.getCanvas().style.cursor = "pointer";
        const p = (f as unknown as { properties: { name: string; count: number; ratio: number; level: string } }).properties;
        popup.setLngLat(e.lngLat).setHTML(`<b>${p.name}</b><br/>About ${p.count} people, ${p.level} (${Number(p.ratio).toFixed(1)}x usual)`).addTo(m);
      };
      for (const id of ["hot-dots", "hot-columns"]) {
        m.on("mousemove", id, onHot);
        m.on("mouseleave", id, () => { m.getCanvas().style.cursor = ""; popup.remove(); });
        m.on("click", id, (e) => { const bid = (e.features?.[0] as unknown as { properties?: { id?: string } } | undefined)?.properties?.id; if (bid) cb.current.onSelectBuilding(bid); });
      }
      ready.current = true;
      syncHotspots();
      syncLayers();
    });

    const mk = markers.current;
    return () => { m.remove(); map.current = null; ready.current = false; mk.clear(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function syncHotspots() {
    const m = map.current;
    if (!m || !ready.current) return;
    const g = hotspotGeo(cb.current.hotspots, cb.current.buildings);
    (m.getSource("hot-points") as mapboxgl.GeoJSONSource | undefined)?.setData(g.points);
    (m.getSource("hot-columns") as mapboxgl.GeoJSONSource | undefined)?.setData(g.columns);
  }
  function syncLayers() {
    const m = map.current;
    if (!m || !ready.current) return;
    const { hotspots, columns } = cb.current.layers;
    m.setLayoutProperty("hot-heat", "visibility", hotspots ? "visible" : "none");
    m.setLayoutProperty("hot-dots", "visibility", hotspots ? "visible" : "none");
    m.setLayoutProperty("hot-columns", "visibility", columns ? "visible" : "none");
  }

  useEffect(syncHotspots, [props.hotspots, props.buildings]);
  useEffect(syncLayers, [props.layers]);

  // event pins (spread events in the same building so they don't overlap)
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const seen = new Set<string>();
    const perBuilding = new Map<string, number>();
    const now = new Date();
    for (const e of props.layers.events ? props.events : []) {
      if (e.lat == null || e.lng == null) continue;
      seen.add(e.id);
      const idx = perBuilding.get(e.buildingId) ?? 0;
      perBuilding.set(e.buildingId, idx + 1);
      const angle = idx * 2.1;
      const r = idx === 0 ? 0 : 0.00009 + idx * 0.00002;
      const lng = e.lng + Math.cos(angle) * r * 1.2;
      const lat = e.lat + Math.sin(angle) * r;
      const color = (CATEGORY_META[e.category] ?? CATEGORY_META.social).color;
      let entry = markers.current.get(e.id);
      if (!entry) {
        const div = document.createElement("div");
        div.addEventListener("click", (ev) => { ev.stopPropagation(); cb.current.onSelectEvent(e.id); });
        const marker = new mapboxgl.Marker({ element: div, anchor: "center", occludedOpacity: 0.35 }).setLngLat([lng, lat]).addTo(m);
        entry = { m: marker, el: div };
        markers.current.set(e.id, entry);
      } else entry.m.setLngLat([lng, lat]);
      const size = Math.round(12 + Math.min(10, Math.sqrt(e.attendeeCount) * 0.9));
      const dim = props.highlightIds ? !props.highlightIds.includes(e.id) : false;
      entry.el.className = `mapboxgl-marker ev-pin${isLive(e, now) ? " live" : ""}${props.selectedEventId === e.id ? " selected" : ""}${dim ? " dim" : ""}`;
      entry.el.style.width = entry.el.style.height = `${size}px`;
      entry.el.style.background = color;
      entry.el.style.color = color;
      entry.el.title = e.title;
    }
    for (const [id, entry] of markers.current) if (!seen.has(id)) { entry.m.remove(); markers.current.delete(id); }
  }, [props.events, props.selectedEventId, props.highlightIds, props.layers.events]);

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

  useEffect(() => {
    if (!props.focus || !map.current) return;
    map.current.flyTo({ center: [props.focus.lng, props.focus.lat], zoom: props.focus.zoom ?? 17.2, pitch: 62, speed: 1.1, essential: true });
  }, [props.focus]);

  if (!TOKEN) {
    return <div className="absolute inset-0 flex items-center justify-center bg-surface text-sm text-muted">Add NEXT_PUBLIC_MAPBOX_TOKEN to .env.local to load the map.</div>;
  }
  return (
    <div className="absolute inset-0">
      <div ref={el} className="h-full w-full" />
    </div>
  );
}
