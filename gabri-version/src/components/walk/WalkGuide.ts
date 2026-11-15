"use client";

import mapboxgl from "mapbox-gl";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { BUILDINGS, distanceMeters } from "@/lib/campus";
import { buildTrojan, type CharacterAsset } from "./trojanModel";

// Procedural Trojan mascot (see trojanModel.ts): walks, waves and grins on arrival.
const CHARACTER_HEIGHT_M = 3.4; // a bit larger than life so it reads on screen
const WALK_SPEED_MPS = 1.4; // used for the real ETA

// Third-person chase camera: rides the path behind the robot and looks ahead down the route.
const CAM_BACK_M = 15;
const CAM_UP_M = 11;
const LOOK_AHEAD_M = 9;
const CRANE_START_M = 34; // extra height at the start, settles down as the walk begins
const INTRO_S = 2.2;

// Our map layers that would clutter the cinematic view.
const HIDE_DURING_WALK = ["ev-halo", "ev-pins", "ev-labels", "hot-heat", "hot-hit", "hot-columns"];

type LL = { lng: number; lat: number };
type Eye = LL & { alt: number };
export type WalkStep = { instruction: string; startM: number; distance: number };
export type WalkPhase = "loading" | "overview" | "walking" | "paused" | "arrived" | "error";
export type WalkProgress = {
  phase: WalkPhase;
  traveledM: number;
  totalM: number;
  realMinutes: number;
  step?: WalkStep;
  nextStep?: WalkStep;
  passing?: string;
  fallback?: boolean;
  error?: string;
};
export interface WalkOptions {
  from: LL & { label: string };
  to: LL & { name: string; code: string; id: string };
  token: string;
  onProgress: (p: WalkProgress) => void;
}

// ---------- geometry helpers ----------
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;
function bearing(a: LL, b: LL) {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
function offset(p: LL, bearingDeg: number, meters: number): LL {
  const dLat = (meters * Math.cos(toRad(bearingDeg))) / 111_320;
  const dLng = (meters * Math.sin(toRad(bearingDeg))) / (111_320 * Math.cos(toRad(p.lat)));
  return { lng: p.lng + dLng, lat: p.lat + dLat };
}
const angleDiff = (a: number, b: number) => ((b - a + 540) % 360) - 180;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpEye = (a: Eye, b: Eye, t: number): Eye => ({ lng: lerp(a.lng, b.lng, t), lat: lerp(a.lat, b.lat, t), alt: lerp(a.alt, b.alt, t) });
const lerpLL = (a: LL, b: LL, t: number): LL => ({ lng: lerp(a.lng, b.lng, t), lat: lerp(a.lat, b.lat, t) });
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

class Path {
  cum: number[] = [0];
  constructor(public pts: LL[]) {
    for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + distanceMeters(pts[i - 1], pts[i]));
  }
  get length() {
    return this.cum[this.cum.length - 1];
  }
  at(d: number): { p: LL; bearing: number; i: number } {
    const dist = Math.max(0, Math.min(this.length, d));
    let lo = 0;
    let hi = this.cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] <= dist) lo = mid;
      else hi = mid;
    }
    const a = this.pts[lo];
    const b = this.pts[hi];
    const seg = this.cum[hi] - this.cum[lo] || 1;
    const t = (dist - this.cum[lo]) / seg;
    return { p: { lng: a.lng + (b.lng - a.lng) * t, lat: a.lat + (b.lat - a.lat) * t }, bearing: bearing(a, b), i: lo };
  }
  slice(d: number): [number, number][] {
    const { p, i } = this.at(d);
    return [...this.pts.slice(0, i + 1).map((q) => [q.lng, q.lat] as [number, number]), [p.lng, p.lat]];
  }
  /** Distance along the path of the point closest to q, and how far q is from the path. */
  project(q: LL): { along: number; off: number } {
    let best = { along: 0, off: Infinity };
    for (let i = 0; i < this.pts.length - 1; i++) {
      for (let s = 0; s <= 10; s++) {
        const t = s / 10;
        const p = { lng: this.pts[i].lng + (this.pts[i + 1].lng - this.pts[i].lng) * t, lat: this.pts[i].lat + (this.pts[i + 1].lat - this.pts[i].lat) * t };
        const off = distanceMeters(p, q);
        if (off < best.off) best = { along: this.cum[i] + (this.cum[i + 1] - this.cum[i]) * t, off };
      }
    }
    return best;
  }
}

// ---------- model (built once, reused) ----------
const loadModel = async (): Promise<CharacterAsset> => buildTrojan();

function softShadowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, "rgba(0,0,0,0.55)");
  grad.addColorStop(0.5, "rgba(0,0,0,0.22)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/** the "you are here" circle: soft blue, a little stronger at the rim (blue, so it never reads as a red DPS zone or a gold live game) */
function accuracyTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, "rgba(59,130,246,0.5)");
  grad.addColorStop(0.84, "rgba(59,130,246,0.3)");
  grad.addColorStop(0.94, "rgba(96,165,250,0.95)");
  grad.addColorStop(1, "rgba(96,165,250,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

// ---------- three.js custom layer ----------
export class CharacterLayer implements mapboxgl.CustomLayerInterface {
  id = "walk-character";
  type = "custom" as const;
  renderingMode = "3d" as const;
  pos: LL;
  heading = 0;
  timeScale = 1;
  /** drawing size multiplier (play mode draws the Trojan bigger so it reads like a game character) */
  scale = 1;
  /** draw over buildings instead of behind them */
  alwaysOnTop = false;
  /** meters above the ground (picked up and carried by the recall animation) */
  lift = 0;
  /** "you are here": a soft pulsing circle under the feet with this radius in meters on the ground, in place of
   *  the thin gold ring (null: the ring, as on the tour guide and in play mode) */
  accuracyM: number | null = null;
  /** called at the start of every frame with the time in ms, so the owner can move and turn the character */
  onFrame: ((now: number) => void) | null = null;
  /** reduced motion: hold the pose, no pulsing, and no continuous redraw (the owner repaints when something changes) */
  still = false;
  private disc: THREE.Mesh | null = null;
  /** each light and its daytime strength, so dusk and night can dim the character to match the map */
  private lit: [THREE.Light, number][] = [];
  private camera = new THREE.Camera();
  private scene = new THREE.Scene();
  private lights = new THREE.Group();
  private ring: THREE.Mesh;
  private renderer: THREE.WebGLRenderer | null = null;
  private map: mapboxgl.Map | null = null;
  private unitsPerMeter = 1;
  private mixer: THREE.AnimationMixer;
  private actions: Record<string, THREE.AnimationAction> = {};
  private current: THREE.AnimationAction | null = null;
  private clock = new THREE.Clock();
  private envReady = false;

  constructor(gltf: CharacterAsset, start: LL) {
    this.pos = start;
    const root = gltf.scene;
    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);
    root.scale.set(1, 1, 1);
    this.scene.add(root);
    const box = new THREE.Box3().setFromObject(root);
    const h = box.max.y - box.min.y;
    const modelH = h > 0.1 && h < 1000 ? h : 4.5;
    this.unitsPerMeter = modelH / CHARACTER_HEIGHT_M;

    // soft contact shadow + a thin glowing ring so you can spot "you" from far away
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(modelH * 0.95, modelH * 0.95),
      new THREE.MeshBasicMaterial({ map: softShadowTexture(), transparent: true, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = modelH * 0.004;
    this.scene.add(shadow);
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(modelH * 0.36, modelH * 0.4, 64),
      new THREE.MeshBasicMaterial({ color: "#ffcc00", transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = modelH * 0.006;
    this.scene.add(this.ring);

    // world-fixed lighting (the group is counter-rotated each frame so the sun doesn't spin with the robot)
    this.lights.add(new THREE.HemisphereLight("#ffffff", "#8a7f6e", 1.5));
    const sun = new THREE.DirectionalLight("#fff4e0", 2.2);
    sun.position.set(-modelH * 2, modelH * 4, -modelH * 1.5);
    this.lights.add(sun);
    const rim = new THREE.DirectionalLight("#cfe0ff", 0.6);
    rim.position.set(modelH * 2, modelH * 2, modelH * 2.5);
    this.lights.add(rim);
    this.scene.add(this.lights);
    // soft fill from the character's front so the face never sits in shadow
    const fill = new THREE.DirectionalLight("#fff1e2", 1.1);
    fill.position.set(0, modelH * 1.5, modelH * 3);
    this.scene.add(fill);
    this.scene.traverse((o) => { const l = o as THREE.Light; if (l.isLight) this.lit.push([l, l.intensity]); });

    this.mixer = new THREE.AnimationMixer(root);
    for (const clip of gltf.animations) this.actions[clip.name] = this.mixer.clipAction(clip);
  }

  /** match the map's lighting: a daylit character on a night map looks pasted on */
  setLight(preset: string | undefined) {
    const f = preset === "night" ? 0.38 : preset === "dusk" || preset === "dawn" ? 0.7 : 1;
    for (const [l, base] of this.lit) l.intensity = base * f;
  }

  play(name: string, once = false) {
    const next = this.actions[name];
    if (!next || next === this.current) return;
    next.reset();
    if (once) {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
    } else next.setLoop(THREE.LoopRepeat, Infinity);
    next.play();
    if (this.current) this.current.crossFadeTo(next, 0.35, false);
    this.current = next;
  }

  onAdd(map: mapboxgl.Map, gl: WebGL2RenderingContext) {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;
    this.clock.start();
  }

  render(gl: WebGL2RenderingContext, matrix: number[]) {
    if (!this.renderer || !this.map) return;
    if (!this.envReady) {
      // studio reflections on the metal (gold armor, helmet, sword) only.
      // Done here, where the map resets GL state after us.
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      this.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        for (const m of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[]) {
          if (m.name === "Gold" || m.name === "GoldDark" || m.name === "Steel") {
            m.envMap = env;
            m.needsUpdate = true;
          }
        }
      });
      pmrem.dispose();
      this.envReady = true;
    }
    this.onFrame?.(performance.now());
    const dt = this.clock.getDelta();
    this.mixer.update(this.still ? 0 : dt * this.timeScale);
    const t = this.clock.elapsedTime;
    (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.35 * Math.sin(t * 3);
    this.ring.visible = this.accuracyM == null;
    if (this.accuracyM != null) {
      if (!this.disc) {
        this.disc = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshBasicMaterial({ map: accuracyTexture(), transparent: true, depthWrite: false }));
        this.disc.rotation.x = -Math.PI / 2;
        this.disc.position.y = this.ring.position.y * 0.5; // under the contact shadow
        this.scene.add(this.disc);
      }
      const pulse = this.still ? 0.5 : 0.5 + 0.5 * Math.sin(t * 2.2);
      // the radius is meters on the ground, whatever size the character is drawn at
      this.disc.scale.setScalar(((this.accuracyM * this.unitsPerMeter) / this.scale) * (1 + 0.06 * pulse));
      (this.disc.material as THREE.MeshBasicMaterial).opacity = 0.6 + 0.4 * pulse;
      this.disc.visible = true;
    } else if (this.disc) this.disc.visible = false;

    const rotYAngle = Math.PI - toRad(this.heading);
    this.lights.rotation.y = -rotYAngle;
    const mc = mapboxgl.MercatorCoordinate.fromLngLat([this.pos.lng, this.pos.lat], this.lift);
    const s = (mc.meterInMercatorCoordinateUnits() / this.unitsPerMeter) * this.scale;
    const rotX = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    const rotY = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(0, 1, 0), rotYAngle);
    const l = new THREE.Matrix4().makeTranslation(mc.x, mc.y, mc.z).scale(new THREE.Vector3(s, -s, s)).multiply(rotX).multiply(rotY);
    this.camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix).multiply(l);
    this.renderer.resetState();
    // play mode: the player is never hidden behind a building (drawn over them, like most map games)
    if (this.alwaysOnTop) gl.clear(gl.DEPTH_BUFFER_BIT);
    this.renderer.render(this.scene, this.camera);
    if (!this.still) this.map.triggerRepaint();
  }

  onRemove() {
    this.mixer.stopAllAction();
    this.current = null;
    this.renderer = null;
    this.map = null;
  }
}

// ---------- the guide ----------
type Mode = WalkPhase | "intro";

export class WalkGuide {
  private map: mapboxgl.Map;
  private opts: WalkOptions;
  private path: Path | null = null;
  private steps: WalkStep[] = [];
  private landmarks: { name: string; atM: number }[] = [];
  private layer: CharacterLayer | null = null;
  private destMarker: mapboxgl.Marker | null = null;
  private raf = 0;
  private last = 0;
  private traveled = 0;
  private speed = 30; // demo playback speed (m/s), set from route length
  private mode: Mode = "loading";
  private fallback = false;
  private lastEmit = 0;
  private destroyed = false;
  private prevMaxZoom: number;
  private prevMaxPitch: number;
  private timers: ReturnType<typeof setTimeout>[] = [];
  // camera state
  private eye: Eye | null = null;
  private look: LL | null = null;
  private introFrom: { eye: Eye; look: LL } | null = null;
  private introT = 0;
  private arriveT = 0;
  private arriveHeading = 0;
  private waved = false;

  constructor(map: mapboxgl.Map, opts: WalkOptions) {
    this.map = map;
    this.opts = opts;
    this.prevMaxZoom = map.getMaxZoom();
    this.prevMaxPitch = map.getMaxPitch();
  }

  async start() {
    this.emit(true);
    try {
      const [route, gltf] = await Promise.all([this.fetchRoute(), loadModel()]);
      if (this.destroyed) return;
      this.path = new Path(route);
      this.speed = this.path.length / Math.min(28, Math.max(16, this.path.length / 30));
      this.findLandmarks();
      this.layer = new CharacterLayer(gltf, route[0]);
      this.layer.heading = this.path.at(0).bearing;
      this.install();
      this.overview();
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.tick);
    } catch (e) {
      this.mode = "error";
      this.opts.onProgress({ phase: "error", traveledM: 0, totalM: 0, realMinutes: 0, error: (e as Error).message || "Couldn't load the walk" });
    }
  }

  /** (Re)adds sources/layers; safe to call again after a style switch. */
  install() {
    const m = this.map;
    if (!this.path || this.destroyed) return;
    const line = (coords: [number, number][]) => ({ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: coords } });
    if (!m.getSource("walk-route")) {
      m.addSource("walk-route", { type: "geojson", data: line(this.path.pts.map((p) => [p.lng, p.lat])) });
      m.addSource("walk-done", { type: "geojson", data: line(this.path.slice(this.traveled)) });
      m.addLayer({ id: "walk-casing", type: "line", source: "walk-route", slot: "middle", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["exponential", 2], ["zoom"], 15, 6, 22, 78], "line-emissive-strength": 1 } });
      m.addLayer({ id: "walk-todo", type: "line", source: "walk-route", slot: "middle", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#f5b800", "line-width": ["interpolate", ["exponential", 2], ["zoom"], 15, 3, 22, 46], "line-emissive-strength": 1 } });
      m.addLayer({ id: "walk-done", type: "line", source: "walk-done", slot: "middle", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#a3001b", "line-width": ["interpolate", ["exponential", 2], ["zoom"], 15, 4, 22, 56], "line-emissive-strength": 1 } });
    }
    if (this.layer && !m.getLayer(this.layer.id)) m.addLayer(this.layer);
    for (const id of HIDE_DURING_WALK) if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", "none");
    if (!this.destMarker) {
      const el = document.createElement("div");
      el.className = "walk-dest";
      el.innerHTML = `<span class="walk-dest-ring"></span><span class="walk-dest-label">${escapeHtml(this.opts.to.name)}${this.opts.to.code ? ` · ${escapeHtml(this.opts.to.code)}` : ""}</span>`;
      this.destMarker = new mapboxgl.Marker({ element: el, anchor: "bottom" }).setLngLat([this.opts.to.lng, this.opts.to.lat]).addTo(m);
    }
  }

  pause() {
    if (this.mode !== "walking") return;
    this.mode = "paused";
    this.layer?.play("Idle");
    this.emit(true);
  }

  resume() {
    if (this.mode !== "paused") return;
    this.mode = "walking";
    this.layer?.play("Walk");
    this.emit(true);
  }

  restart() {
    if (!this.path || !this.layer) return;
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.traveled = 0;
    this.waved = false;
    this.layer.pos = this.path.at(0).p;
    this.layer.heading = this.path.at(0).bearing;
    (this.map.getSource("walk-done") as mapboxgl.GeoJSONSource | undefined)?.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: this.path.slice(0) } });
    this.overview();
  }

  /** Removes everything the walk added. The caller restores its own layer visibility. */
  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.timers.forEach(clearTimeout);
    const m = this.map;
    try {
      for (const id of ["walk-character", "walk-done", "walk-todo", "walk-casing"]) if (m.getLayer(id)) m.removeLayer(id);
      for (const id of ["walk-done", "walk-route"]) if (m.getSource(id)) m.removeSource(id);
    } catch {
      /* style may already be gone */
    }
    this.destMarker?.remove();
    m.setMaxZoom(this.prevMaxZoom);
    m.setMaxPitch(this.prevMaxPitch);
  }

  // ---- internals ----
  private async fetchRoute(): Promise<LL[]> {
    const { from, to, token } = this.opts;
    const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${from.lng},${from.lat};${to.lng},${to.lat}?geometries=geojson&overview=full&steps=true&access_token=${token}`;
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Directions ${r.status}`);
      const d = await r.json();
      const route = d.routes?.[0];
      if (!route) throw new Error("No route");
      // Starts at the door you walk out of and stops on the walkway by the entrance (building centers are inside walls).
      const pts: LL[] = route.geometry.coordinates.map(([lng, lat]: [number, number]) => ({ lng, lat }));
      const raw: { maneuver: { instruction: string }; distance: number }[] = route.legs?.[0]?.steps ?? [];
      this.steps = [];
      let acc = 0;
      for (const s of raw) {
        if (s.distance >= 8 || this.steps.length === 0) this.steps.push({ instruction: s.maneuver.instruction, startM: acc, distance: s.distance });
        acc += s.distance;
      }
      return pts;
    } catch {
      // Offline or API trouble: walk a straight line so the demo still plays.
      this.fallback = true;
      this.steps = [{ instruction: `Head toward ${to.name}`, startM: 0, distance: distanceMeters(from, to) }];
      return [{ lng: from.lng, lat: from.lat }, { lng: to.lng, lat: to.lat }];
    }
  }

  private findLandmarks() {
    if (!this.path) return;
    this.landmarks = BUILDINGS.filter((b) => b.id !== this.opts.to.id && distanceMeters(b, this.opts.from) > 60)
      .map((b) => ({ name: b.name, ...this.path!.project(b) }))
      .filter((b) => b.off < 55 && b.along > 40 && b.along < this.path!.length - 40)
      .map((b) => ({ name: b.name, atM: b.along }))
      .sort((a, b) => a.atM - b.atM);
  }

  /** Establishing shot of the whole route, then a camera move down behind the robot. */
  private overview() {
    if (!this.path || !this.layer) return;
    this.mode = "overview";
    this.eye = null;
    this.look = null;
    this.layer.play("Idle");
    this.emit(true);
    const b0 = this.path.at(0).bearing;
    const bounds = new mapboxgl.LngLatBounds();
    this.path.pts.forEach((p) => bounds.extend([p.lng, p.lat]));
    const cam = this.map.cameraForBounds(bounds, { padding: { top: 190, bottom: 90, left: 80, right: 80 }, bearing: b0, pitch: 50 });
    if (cam) this.map.easeTo({ ...cam, pitch: 50, bearing: b0, duration: 1800, essential: true });
    this.timers.push(
      setTimeout(() => {
        if (this.destroyed) return;
        this.map.setMaxZoom(24);
        this.map.setMaxPitch(85);
        const fc = this.map.getFreeCameraOptions();
        const pos = fc.position;
        const c = this.map.getCenter();
        const ll = pos ? pos.toLngLat() : c;
        this.introFrom = { eye: { lng: ll.lng, lat: ll.lat, alt: pos ? pos.toAltitude() : 400 }, look: { lng: c.lng, lat: c.lat } };
        this.introT = 0;
        this.mode = "intro";
      }, 2300),
    );
  }

  private chaseTarget(): { eye: Eye; look: LL } {
    const path = this.path!;
    const t = this.traveled;
    let eyeP: LL;
    if (t >= CAM_BACK_M) eyeP = path.at(t - CAM_BACK_M).p;
    else {
      const s = path.at(0);
      eyeP = offset(s.p, s.bearing + 180, CAM_BACK_M - t);
    }
    const crane = Math.max(0, 1 - t / 60) * CRANE_START_M;
    return { eye: { ...eyeP, alt: CAM_UP_M + crane }, look: path.at(t + LOOK_AHEAD_M).p };
  }

  private applyCamera(eye: Eye, look: LL) {
    const cam = this.map.getFreeCameraOptions();
    cam.position = mapboxgl.MercatorCoordinate.fromLngLat([eye.lng, eye.lat], eye.alt);
    cam.lookAtPoint([look.lng, look.lat]);
    this.map.setFreeCameraOptions(cam);
  }

  private tick = (now: number) => {
    if (this.destroyed || !this.path || !this.layer) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const L = this.layer;

    if (this.mode === "intro" && this.introFrom) {
      this.introT = Math.min(1, this.introT + dt / INTRO_S);
      const k = easeInOut(this.introT);
      const target = this.chaseTarget();
      this.eye = lerpEye(this.introFrom.eye, target.eye, k);
      this.look = lerpLL(this.introFrom.look, target.look, k);
      this.applyCamera(this.eye, this.look);
      if (this.introT >= 1) {
        this.mode = "walking";
        L.play("Walk");
        this.emit(true);
      }
    } else if (this.mode === "walking") {
      this.traveled = Math.min(this.path.length, this.traveled + this.speed * dt);
      const here = this.path.at(this.traveled);
      // turn smoothly at corners instead of snapping
      const turn = angleDiff(L.heading, here.bearing);
      L.heading = (L.heading + Math.max(-1, Math.min(1, turn / 25)) * 300 * dt + 360) % 360;
      L.pos = here.p;
      (this.map.getSource("walk-done") as mapboxgl.GeoJSONSource | undefined)?.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: this.path.slice(this.traveled) } });
      this.follow(this.chaseTarget(), dt, 3.2);
      if (this.traveled >= this.path.length - 0.01) this.arrive();
    } else if (this.mode === "arrived") {
      this.arriveT += dt;
      // turn around to face the camera, then wave
      const face = (this.arriveHeading + 180) % 360;
      const turn = angleDiff(L.heading, face);
      if (Math.abs(turn) > 1) L.heading = (L.heading + Math.sign(turn) * Math.min(Math.abs(turn), 240 * dt) + 360) % 360;
      else if (!this.waved) {
        this.waved = true;
        L.play("Wave", true);
        this.timers.push(setTimeout(() => !this.destroyed && this.mode === "arrived" && L.play("Happy"), 2950));
      }
      // gentle close-up arc on the side he came from (open walkway, so the camera never clips a building)
      const arc = this.arriveHeading + 180 + 32 * Math.sin(this.arriveT * 0.35);
      const eyeP = offset(L.pos, arc, 15);
      this.follow({ eye: { ...eyeP, alt: 6.5 }, look: offset(L.pos, arc + 180, 3) }, dt, 1.6);
    }
    this.emit(false);
    this.raf = requestAnimationFrame(this.tick);
  };

  private follow(target: { eye: Eye; look: LL }, dt: number, rate: number) {
    const k = 1 - Math.exp(-dt * rate);
    this.eye = this.eye ? lerpEye(this.eye, target.eye, k) : target.eye;
    this.look = this.look ? lerpLL(this.look, target.look, Math.min(1, k * 1.4)) : target.look;
    this.applyCamera(this.eye, this.look);
  }

  private arrive() {
    if (!this.layer) return;
    this.mode = "arrived";
    this.arriveT = 0;
    this.waved = false;
    this.arriveHeading = this.layer.heading;
    this.layer.play("Idle");
    this.emit(true);
  }

  private emit(force: boolean) {
    const now = performance.now();
    if (!force && now - this.lastEmit < 120) return;
    this.lastEmit = now;
    const total = this.path?.length ?? 0;
    const t = this.traveled;
    let step: WalkStep | undefined;
    let nextStep: WalkStep | undefined;
    for (let i = 0; i < this.steps.length; i++) {
      if (this.steps[i].startM <= t + 6) {
        step = this.steps[i];
        nextStep = this.steps[i + 1];
      }
    }
    const passing = this.landmarks.find((l) => Math.abs(l.atM - t) < 35)?.name;
    const phase: WalkPhase = this.mode === "intro" ? "overview" : this.mode;
    this.opts.onProgress({ phase, traveledM: t, totalM: total, realMinutes: Math.max(1, Math.round(total / WALK_SPEED_MPS / 60)), step, nextStep, passing, fallback: this.fallback });
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
