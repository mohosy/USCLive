"use client";

import mapboxgl from "mapbox-gl";
import type { Feature, FeatureCollection } from "geojson";
import { useEffect, useRef } from "react";
import { CATEGORY_META, USC_CENTER } from "@/lib/campus";
import { isLive, type Building, type EventView, type Hotspot, type Loc } from "@/lib/client-types";
import { LEVEL_COLOR } from "./ui";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

export type MapStyle = "map" | "satellite";
const STYLES: Record<MapStyle, { url: string; config: Record<string, unknown> }> = {
  // Mapbox Standard: 3D buildings, landmark models, trees, lighting
  // Mapbox's own POIs, landmark icons and place names are off: every label on the map is ours.
  map: {
    url: "mapbox://styles/mapbox/standard",
    config: { lightPreset: "day", show3dObjects: true, show3dBuildings: true, show3dLandmarks: true, show3dTrees: true, showTransitLabels: false, showRoadLabels: true },
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

// Keep the camera on USC University Park Campus (plus a little margin).
const USC_BOUNDS: [[number, number], [number, number]] = [[-118.2995, 34.0115], [-118.2715, 34.0305]];

export interface Camera { longitude: number; latitude: number; zoom: number; pitch: number; bearing: number }

export interface MapLayers { events: boolean; hotspots: boolean; columns: boolean; places: boolean }

interface Props {
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
  initialCamera?: Camera | null;
  onCamera?: (c: Camera) => void;
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
    features: buildings.map((b) => ({ type: "Feature", properties: { id: b.id, name: b.name }, geometry: { type: "Point", coordinates: [b.lng, b.lat] } })),
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
        color: (CATEGORY_META[e.category] ?? CATEGORY_META.social).color,
        radius: Math.round(6 + Math.min(5, Math.sqrt(e.attendeeCount) * 0.45)),
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
  const data = useRef<{ events: FC; points: FC; columns: FC; buildings: FC }>({ events: EMPTY, points: EMPTY, columns: EMPTY, buildings: buildingLabelGeo(props.buildings) });
  const cb = useRef(props);
  useEffect(() => { cb.current = props; });

  function setSource(id: string, fc: FC) {
    (map.current?.getSource(id) as mapboxgl.GeoJSONSource | undefined)?.setData(fc);
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
    const sat = styleRef.current === "satellite";
    m.addSource("events", { type: "geojson", data: data.current.events });
    m.addSource("hot-points", { type: "geojson", data: data.current.points });
    m.addSource("hot-columns", { type: "geojson", data: data.current.columns });
    m.addSource("building-labels", { type: "geojson", data: data.current.buildings });


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
    m.addLayer({
      id: "building-names", type: "symbol", source: "building-labels", slot: "top", minzoom: 16,
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
        "circle-radius": ["+", ["get", "radius"], 6],
        "circle-color": ["get", "color"],
        "circle-opacity": ["case", ["get", "dim"], 0.05, 0.22],
        "circle-pitch-alignment": "viewport",
        "circle-emissive-strength": 1,
      },
    });
    m.addLayer({
      id: "ev-pins", type: "circle", source: "events", slot: "top",
      layout: { "circle-sort-key": ["get", "sort"] },
      paint: {
        "circle-radius": ["case", ["get", "selected"], ["+", ["get", "radius"], 3], ["get", "radius"]],
        "circle-color": ["get", "color"],
        "circle-stroke-color": ["case", ["get", "selected"], "#990000", "#ffffff"],
        "circle-stroke-width": ["case", ["get", "selected"], 3, 2],
        "circle-opacity": dimmed,
        "circle-stroke-opacity": dimmed,
        "circle-pitch-alignment": "viewport",
        "circle-emissive-strength": 1,
      },
    });
    m.addLayer({
      id: "ev-labels", type: "symbol", source: "events", slot: "top", minzoom: 17,
      layout: {
        "text-field": ["get", "title"],
        "text-size": 11,
        "text-offset": [0, 1.3],
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
  }

  useEffect(() => {
    if (!el.current || map.current || !TOKEN) return;
    const s = STYLES[styleRef.current];
    const m = new mapboxgl.Map({
      container: el.current,
      accessToken: TOKEN,
      style: s.url,
      config: { basemap: { ...s.config, ...placeConfig(styleRef.current, props.layers.places) } },
      center: props.initialCamera ? [props.initialCamera.longitude, props.initialCamera.latitude] : USC_CENTER,
      zoom: props.initialCamera?.zoom ?? 16.4,
      minZoom: 15,
      maxZoom: 19.5,
      maxBounds: USC_BOUNDS,
      pitch: props.initialCamera?.pitch ?? 60,
      maxPitch: 72,
      bearing: props.initialCamera?.bearing ?? -20,
    });
    map.current = m;
    m.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "bottom-right");
    m.on("style.load", install);
    // trackpad two-finger click = right click: rotate the map instead of opening the browser menu
    el.current.addEventListener("contextmenu", (e) => e.preventDefault());
    const emit = () => {
      const c = m.getCenter();
      cb.current.onCamera?.({ longitude: c.lng, latitude: c.lat, zoom: m.getZoom(), pitch: m.getPitch(), bearing: m.getBearing() });
    };
    m.on("move", emit);
    emit();

    const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
    m.on("mouseenter", "ev-pins", () => (m.getCanvas().style.cursor = "pointer"));
    m.on("mouseleave", "ev-pins", () => (m.getCanvas().style.cursor = ""));
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

    return () => { m.remove(); map.current = null; ready.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // switch Map <-> Satellite (our layers are re-added on style.load)
  useEffect(() => {
    const m = map.current;
    if (!m || styleRef.current === props.mapStyle) return;
    styleRef.current = props.mapStyle;
    ready.current = false;
    const s = STYLES[props.mapStyle];
    m.setStyle(s.url, { config: { basemap: { ...s.config, ...placeConfig(props.mapStyle, cb.current.layers.places) } } } as unknown as Parameters<mapboxgl.Map["setStyle"]>[1]);
  }, [props.mapStyle]);

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
    map.current.flyTo({ center: [props.focus.lng, props.focus.lat], zoom: props.focus.zoom ?? 17.4, speed: 1.2, essential: true });
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
