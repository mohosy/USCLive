/**
 * Mini Trojans living on the map: blocky little people who walk the real campus walkways (OpenStreetMap),
 * cross at crosswalks, head to busy places, then sit on the quad, chat outside buildings or take photos at
 * Tommy Trojan. More of them in the morning and at lunch, a few at night. Purely decorative: they're not
 * real people or real positions.
 *
 * Everything is drawn with one instanced mesh per body part (a handful of draw calls for the whole crowd),
 * inside the map's own WebGL context so buildings hide people behind them.
 */
import mapboxgl from "mapbox-gl";
import * as THREE from "three";
import type { LightPreset } from "@/lib/sun";

export interface PathGraph { nodes: [number, number][]; edges: [number, number][] }
export type SpotKind = "photo" | "sit" | "chat" | "event";
/** `id` (events): reported back through onArrive when someone gets there */
export interface CrowdSpot { id?: string; lng: number; lat: number; kind: SpotKind; weight: number }

type Idle = "sit" | "photo" | "pose" | "chat";
interface Agent {
  route: number[]; // graph nodes still to walk through
  x: number; z: number; heading: number;
  goal: { x: number; z: number } | null; // last few meters off the path, to the exact idle spot
  spot: SpotKind;
  spotId?: string;
  idle: Idle | null; idleLeft: number;
  speed: number; phase: number; lane: number;
  life: number; // 0..1 grows in when spawned, shrinks when leaving
  leaving: boolean;
  shirt: THREE.Color; pants: THREE.Color; skin: THREE.Color; hair: THREE.Color;
}

const SHIRTS = ["#a3001b", "#ffc72c", "#ffffff", "#2d3a5a", "#3aa58c", "#f08a4b", "#8e7cc3", "#e85d75", "#4a90d9", "#9aa3ad", "#a3001b", "#ffc72c"];
const PANTS = ["#2f3542", "#4b5563", "#1e3a5f", "#6b5b45", "#3b3b44", "#c8b89a"];
const SKIN = ["#f6cfa8", "#e3a877", "#c58a5c", "#9c6440", "#6e4429", "#ffdcbc"];
const HAIR = ["#2b1d14", "#4a2f1d", "#1a1a1a", "#8a5a2b", "#d9b26a", "#5a3a2a"];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/** How many people are out, by light and hour (real time, or the lighting test switch). */
export function crowdSize(light: LightPreset, hour: number) {
  if (light === "night") return hour >= 18 && hour < 23 ? 26 : 10;
  if (light === "dusk") return 60;
  if (light === "dawn") return 32;
  if (hour >= 12 && hour < 14) return 150; // lunch rush
  if (hour >= 8 && hour < 12) return 130; // classes changing
  if (hour >= 14 && hour < 18) return 115;
  return 90;
}

// ---------- graph + shortest paths ----------
class Walkways {
  xz: Float64Array; // node positions, meters: x east, z south
  adj: { to: number; w: number }[][];
  constructor(g: PathGraph, private lat0: number, private lng0: number) {
    const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180), ky = 110_574;
    this.xz = new Float64Array(g.nodes.length * 2);
    g.nodes.forEach(([lng, lat], i) => { this.xz[i * 2] = (lng - lng0) * kx; this.xz[i * 2 + 1] = -(lat - lat0) * ky; });
    this.adj = g.nodes.map(() => []);
    for (const [a, b] of g.edges) {
      const w = Math.hypot(this.xz[a * 2] - this.xz[b * 2], this.xz[a * 2 + 1] - this.xz[b * 2 + 1]);
      this.adj[a].push({ to: b, w }); this.adj[b].push({ to: a, w });
    }
  }
  toXZ(lng: number, lat: number) {
    const kx = 111_320 * Math.cos((this.lat0 * Math.PI) / 180), ky = 110_574;
    return { x: (lng - this.lng0) * kx, z: -(lat - this.lat0) * ky };
  }
  nearest(x: number, z: number) {
    let best = 0, d = Infinity;
    for (let i = 0; i < this.adj.length; i++) {
      const dd = (this.xz[i * 2] - x) ** 2 + (this.xz[i * 2 + 1] - z) ** 2;
      if (dd < d) { d = dd; best = i; }
    }
    return best;
  }
  /** Dijkstra with a small binary heap (1.4k nodes: well under a millisecond). */
  route(from: number, to: number): number[] {
    const n = this.adj.length, dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1);
    const heap: [number, number][] = [[0, from]];
    dist[from] = 0;
    const push = (e: [number, number]) => { heap.push(e); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    while (heap.length) {
      const [d, u] = pop();
      if (u === to) break;
      if (d > dist[u]) continue;
      for (const { to: v, w } of this.adj[u]) if (d + w < dist[v]) { dist[v] = d + w; prev[v] = u; push([d + w, v]); }
    }
    if (prev[to] === -1 && from !== to) return [];
    const path: number[] = [];
    for (let v = to; v !== -1; v = prev[v]) path.unshift(v);
    return path;
  }
}

// ---------- blocky body (one instanced mesh per part) ----------
function faceTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 16;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, 16, 16);
  g.fillStyle = "#2a1f1a"; g.fillRect(4, 7, 2, 2); g.fillRect(10, 7, 2, 2); // eyes
  g.fillStyle = "#e9a6a0"; g.fillRect(3, 10, 2, 1); g.fillRect(11, 10, 2, 1); // blush
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function shadowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,0.45)"); grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const MAX = 180;
const H = 2.0; // body height in "meters" at scale 1

class CrowdLayer implements mapboxgl.CustomLayerInterface {
  id = "campus-crowd";
  type = "custom" as const;
  renderingMode = "3d" as const;
  private camera = new THREE.Camera();
  private scene = new THREE.Scene();
  private renderer: THREE.WebGLRenderer | null = null;
  private map: mapboxgl.Map | null = null;
  private model: THREE.Matrix4;
  private parts: Record<"legL" | "legR" | "torso" | "armL" | "armR" | "head" | "hair" | "shadow", THREE.InstancedMesh>;
  private disposables: { dispose: () => void }[] = [];
  private hemi = new THREE.HemisphereLight("#ffffff", "#b4a68c", 1.6);
  private ground: THREE.MeshBasicMaterial | null = null;
  private glowSize = 1.3;
  private sun = new THREE.DirectionalLight("#fff1dc", 1.6);
  private last = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  visible = true;

  constructor(private sim: CampusCrowd, origin: [number, number]) {
    const mc = mapboxgl.MercatorCoordinate.fromLngLat(origin, 0);
    const s = mc.meterInMercatorCoordinateUnits();
    this.model = new THREE.Matrix4().makeTranslation(mc.x, mc.y, mc.z).scale(new THREE.Vector3(s, -s, s)).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    // limbs hang from their top (hip / shoulder), so the box is shifted down by half its height
    const box = new THREE.BoxGeometry(1, 1, 1);
    const hang = new THREE.BoxGeometry(1, 1, 1).translate(0, -0.5, 0);
    const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const lam = () => new THREE.MeshLambertMaterial({ color: "#ffffff" });
    const face = new THREE.MeshLambertMaterial({ color: "#ffffff", map: faceTexture() });
    const skinM = lam();
    // a soft dark shadow by day; at night it becomes a warm glow (setLight)
    const shadowM = new THREE.MeshBasicMaterial({ map: shadowTexture(), color: "#000000", transparent: true, depthWrite: false });
    this.ground = shadowM;
    const make = (geo: THREE.BufferGeometry, m: THREE.Material | THREE.Material[]) => {
      const im = new THREE.InstancedMesh(geo, m, MAX);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      im.count = 0;
      this.scene.add(im);
      return im;
    };
    this.parts = {
      legL: make(hang, lam()), legR: make(hang, lam()), torso: make(box, lam()),
      armL: make(hang, lam()), armR: make(hang, lam()),
      // box faces: +x, -x, +y, -y, +z (front: the face), -z
      head: make(box, [skinM, skinM, skinM, skinM, face, skinM]),
      hair: make(box, lam()), shadow: make(plane, shadowM),
    };
    this.disposables.push(box, hang, plane, face, skinM, shadowM, ...Object.values(this.parts));
    this.sun.position.set(-3, 8, 4);
    this.scene.add(this.hemi, this.sun);
  }

  setLight(light: LightPreset) {
    const L = { dawn: ["#ffe9df", 1.5, "#ffc9a0", 1.3], day: ["#ffffff", 1.6, "#fff1dc", 1.6], dusk: ["#f6d2c4", 1.45, "#ff9e6b", 1.2], night: ["#d9d4ff", 1.7, "#ffd9a8", 1.0] } as const;
    const glow = light === "night" || light === "dusk";
    if (this.ground) {
      this.ground.color.set(glow ? (light === "night" ? "#ffb35a" : "#ff9a5a") : "#000000");
      this.ground.blending = glow ? THREE.AdditiveBlending : THREE.NormalBlending;
      this.ground.opacity = glow ? 1 : 0.9;
      this.ground.needsUpdate = true;
    }
    this.glowSize = glow ? 3.2 : 1.3;
    const [sky, hi, sun, si] = L[light];
    this.hemi.color.set(sky); this.hemi.intensity = hi; this.sun.color.set(sun); this.sun.intensity = si;
  }

  onAdd(map: mapboxgl.Map, gl: WebGL2RenderingContext) {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;
    this.last = performance.now();
  }

  private m4 = new THREE.Matrix4();
  private body = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private sc = new THREE.Vector3();
  private put(im: THREE.InstancedMesh, i: number, px: number, py: number, pz: number, rx: number, sx: number, sy: number, sz: number, rz = 0) {
    this.e.set(rx, 0, rz); this.q.setFromEuler(this.e); this.v.set(px, py, pz); this.sc.set(sx, sy, sz);
    this.m4.compose(this.v, this.q, this.sc).premultiply(this.body);
    im.setMatrixAt(i, this.m4);
  }

  render(_gl: WebGL2RenderingContext, matrix: number[]) {
    if (!this.renderer || !this.map) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    // people stay ~22 px tall on screen when zoomed out (toy-sized next to buildings), real size up close
    const mpp = (78_271.517 * Math.cos((this.sim.lat0 * Math.PI) / 180)) / 2 ** this.map.getZoom();
    const k = Math.min(8, Math.max(1.2, (22 * mpp) / H));
    this.sim.step(dt, k);

    const P = this.parts;
    let i = 0;
    for (const a of this.sim.agents) {
      if (!this.visible || i >= MAX) break;
      const s = k * (0.15 + 0.85 * a.life);
      const off = a.idle ? 0 : a.lane * Math.min(1.2, 0.25 * k); // walk side by side, not in a single file
      this.v.set(a.x + Math.cos(a.heading) * off, 0, a.z - Math.sin(a.heading) * off); this.e.set(0, a.heading, 0); this.q.setFromEuler(this.e); this.sc.set(s, s, s);
      this.body.compose(this.v, this.q, this.sc);
      const walking = !a.idle;
      const sw = walking ? Math.sin(a.phase) : 0;
      const sitting = a.idle === "sit";
      const hip = sitting ? 0.32 : 0.8 + (walking ? Math.abs(Math.cos(a.phase)) * 0.04 : 0);
      // legs
      const legRx = sitting ? -1.45 : sw * 0.6;
      this.put(P.legL, i, -0.12, hip, 0, legRx, 0.22, 0.8, 0.24);
      this.put(P.legR, i, 0.12, hip, 0, sitting ? -1.45 : -sw * 0.6, 0.22, 0.8, 0.24);
      // torso + head + hair
      this.put(P.torso, i, 0, hip + 0.33, 0, 0, 0.5, 0.66, 0.28);
      const bob = a.idle === "chat" ? Math.sin(a.phase * 0.7) * 0.06 : 0;
      this.put(P.head, i, 0, hip + 0.66 + 0.25, 0, bob, 0.5, 0.5, 0.5);
      this.put(P.hair, i, 0, hip + 0.66 + 0.47, -0.02, bob, 0.53, 0.12, 0.54);
      // arms
      let aL = -sw * 0.5, aR = sw * 0.5, zL = 0, zR = 0;
      if (a.idle === "photo") { aL = aR = -1.45; zL = -0.25; zR = 0.25; } // holding a phone up
      else if (a.idle === "pose") { aR = -2.9 + Math.sin(a.phase * 2) * 0.25; aL = 0; } // waving at the camera
      else if (a.idle === "chat") { aR = -0.5 + Math.sin(a.phase * 1.3) * 0.35; aL = -0.1; }
      else if (sitting) { aL = aR = -0.35; }
      this.put(P.armL, i, -0.34, hip + 0.62, 0, aL, 0.17, 0.62, 0.2, zL);
      this.put(P.armR, i, 0.34, hip + 0.62, 0, aR, 0.17, 0.62, 0.2, zR);
      this.put(P.shadow, i, 0, 0.03, 0, 0, this.glowSize, 1, this.glowSize);
      for (const [im, c] of [[P.legL, a.pants], [P.legR, a.pants], [P.torso, a.shirt], [P.armL, a.shirt], [P.armR, a.shirt], [P.head, a.skin], [P.hair, a.hair]] as const) im.setColorAt(i, c);
      i++;
    }
    for (const im of Object.values(P)) {
      im.count = i;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
    this.camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix).multiply(this.model);
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    // ~30 fps is plenty for little walkers and keeps the GPU calm (the map doesn't redraw 60x a second for them)
    if (!this.timer) this.timer = setTimeout(() => { this.timer = null; this.map?.triggerRepaint(); }, 33);
  }

  onRemove() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.disposables.forEach((d) => d.dispose());
    this.renderer?.dispose();
    this.renderer = null;
    this.map = null;
  }
}

export class CampusCrowd {
  agents: Agent[] = [];
  readonly lat0: number;
  private lng0: number;
  private ways: Walkways;
  private spots: (CrowdSpot & { x: number; z: number; node: number })[] = [];
  private target = 40;
  private layer: CrowdLayer;
  private spawnTimer = 0;
  private leaveTimer = 0;

  constructor(graph: PathGraph) {
    const lats = graph.nodes.map((n) => n[1]), lngs = graph.nodes.map((n) => n[0]);
    this.lat0 = (Math.min(...lats) + Math.max(...lats)) / 2;
    this.lng0 = (Math.min(...lngs) + Math.max(...lngs)) / 2;
    this.ways = new Walkways(graph, this.lat0, this.lng0);
    this.layer = new CrowdLayer(this, [this.lng0, this.lat0]);
  }

  /** Add (or re-add after a style change) the layer to the map. */
  install(map: mapboxgl.Map, light: LightPreset) {
    if (map.getLayer(this.layer.id)) return;
    map.addLayer(this.layer);
    this.layer.setLight(light);
  }
  remove(map: mapboxgl.Map) { if (map.getLayer(this.layer.id)) map.removeLayer(this.layer.id); }
  setLight(light: LightPreset) { this.layer.setLight(light); }
  setVisible(on: boolean) { this.layer.visible = on; }
  /** someone walked into an event (the map pops a +1 on its banner) */
  onArrive?: (eventId: string) => void;
  setTarget(n: number) { this.target = n; }

  setSpots(spots: CrowdSpot[]) {
    this.spots = spots.map((s) => { const p = this.ways.toXZ(s.lng, s.lat); return { ...s, ...p, node: this.ways.nearest(p.x, p.z) }; });
    // the first time we know where people go, fill campus right away (many already hanging out somewhere)
    if (this.spots.length && !this.filled) {
      this.filled = true;
      while (this.agents.length < this.target) this.spawn(true);
    }
  }
  private filled = false;

  /** A destination: busier places win, and nearby ones are much more likely (short trips you can watch). */
  private pickSpot(from?: { x: number; z: number }) {
    const w = this.spots.map((s) => s.weight * (from ? Math.exp(-Math.hypot(s.x - from.x, s.z - from.z) / (s.kind === "event" ? 900 : 260)) : 1));
    const total = w.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < this.spots.length; i++) if ((r -= w[i]) <= 0) return this.spots[i];
    return this.spots[0];
  }

  private spawn(scatter = false) {
    if (!this.spots.length) return;
    // people come out of buildings (a spot's door) or are already on a path somewhere
    const n = this.ways.adj.length;
    let start = Math.random() < 0.7 ? this.pickSpot().node : Math.floor(Math.random() * n);
    const dest = this.pickSpot();
    if (dest.kind === "event") {
      // heading to an event: start 150-550 m away, somewhere on the walkways
      for (let tries = 0; tries < 20; tries++) {
        const c = Math.floor(Math.random() * n), d = Math.hypot(this.ways.xz[c * 2] - dest.x, this.ways.xz[c * 2 + 1] - dest.z);
        if (d > 150 && d < 550) { start = c; break; }
      }
    }
    const a: Agent = {
      route: [], x: this.ways.xz[start * 2], z: this.ways.xz[start * 2 + 1], heading: Math.random() * 6.28, goal: null, spot: "chat",
      idle: null, idleLeft: 0, speed: 0.85 + Math.random() * 0.35, phase: Math.random() * 6.28, lane: Math.random() * 2 - 1,
      life: scatter ? 1 : 0, leaving: false,
      shirt: new THREE.Color(pick(SHIRTS)), pants: new THREE.Color(pick(PANTS)), skin: new THREE.Color(pick(SKIN)), hair: new THREE.Color(pick(HAIR)),
    };
    // some people are already hanging out somewhere when you open the map
    if (scatter && dest.kind !== "event" && Math.random() < 0.45) this.arrive(a, dest, true);
    else if (dest.kind === "event") {
      this.goTo(a, start, dest);
      // already part-way there when the map opens
      if (scatter) { const cut = Math.floor(a.route.length * Math.random() * 0.8); a.route.splice(0, cut); if (a.route.length) { a.x = this.ways.xz[a.route[0] * 2]; a.z = this.ways.xz[a.route[0] * 2 + 1]; } }
    } else this.plan(a, start);
    this.agents.push(a);
  }

  private plan(a: Agent, from: number) {
    this.goTo(a, from, this.pickSpot({ x: this.ways.xz[from * 2], z: this.ways.xz[from * 2 + 1] }));
  }

  private goTo(a: Agent, from: number, s: CrowdSpot & { x: number; z: number; node: number }) {
    a.route = this.ways.route(from, s.node);
    a.spot = s.kind;
    a.spotId = s.id;
    const r = s.kind === "sit" ? 10 : s.kind === "photo" ? 6 : s.kind === "event" ? 3 : 4;
    const ang = Math.random() * 6.28, d = (0.4 + Math.random() * 0.6) * r;
    a.goal = { x: s.x + Math.cos(ang) * d, z: s.z + Math.sin(ang) * d };
    a.idle = null;
    if (!a.route.length) { a.route = []; } // unreachable: walk straight to the goal
  }

  private arrive(a: Agent, s: { x: number; z: number; kind: SpotKind }, place = false) {
    if (place) {
      const ang = Math.random() * 6.28, d = 2 + Math.random() * 5;
      a.x = s.x + Math.cos(ang) * d; a.z = s.z + Math.sin(ang) * d;
    }
    a.spot = s.kind;
    a.goal = null;
    a.route = [];
    if (s.kind === "event") {
      // walked in: report it and fade away inside
      if (a.spotId) this.onArrive?.(a.spotId);
      a.leaving = true;
      a.idle = "chat";
      a.idleLeft = 99;
      return;
    }
    a.idle = s.kind === "sit" ? "sit" : s.kind === "photo" ? (Math.random() < 0.5 ? "photo" : "pose") : "chat";
    a.idleLeft = 6 + Math.random() * 14;
    if (s.kind === "photo") a.heading = Math.atan2(s.x - a.x, s.z - a.z) + (a.idle === "pose" ? Math.PI : 0); // photographers face the statue, posers face them
  }

  /** Advance the simulation; `k` is the drawing scale (bigger figures walk a little faster so they don't crawl). */
  step(dt: number, k: number) {
    // keep the head count near the target: new people fade in, extra ones leave after their stop
    this.spawnTimer -= dt;
    const alive = this.agents.filter((a) => !a.leaving).length;
    if (alive < this.target && this.spawnTimer <= 0) { this.spawn(); this.spawnTimer = 0.4; }
    // too many (it got late): people head inside, a few per second, idle ones first
    this.leaveTimer -= dt;
    if (alive > this.target && this.leaveTimer <= 0) {
      const a = this.agents.find((x) => !x.leaving && x.idle) ?? this.agents[Math.floor(Math.random() * this.agents.length)];
      if (a) a.leaving = true;
      this.leaveTimer = 0.25;
    }

    const pace = 1.6 * (0.8 + 0.5 * k);
    for (const a of this.agents) {
      a.life = a.leaving ? Math.max(0, a.life - dt * 1.5) : Math.min(1, a.life + dt * 1.5);
      if (a.idle) {
        a.phase += dt * 3;
        a.idleLeft -= dt;
        if (a.idleLeft <= 0) {
          if (Math.random() < 0.3) a.leaving = true; // went inside / headed off campus
          else this.plan(a, this.ways.nearest(a.x, a.z));
        }
        continue;
      }
      // walk: along the route, then off the path to the exact spot
      let tx: number, tz: number, onPath = false;
      if (a.route.length) { tx = this.ways.xz[a.route[0] * 2]; tz = this.ways.xz[a.route[0] * 2 + 1]; onPath = true; }
      else if (a.goal) { tx = a.goal.x; tz = a.goal.z; }
      else { this.plan(a, this.ways.nearest(a.x, a.z)); continue; }
      const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
      const stepLen = pace * a.speed * dt;
      if (d <= stepLen) {
        a.x = tx; a.z = tz;
        if (onPath) a.route.shift();
        else this.arrive(a, { x: tx, z: tz, kind: a.spot });
        continue;
      }
      a.x += (dx / d) * stepLen; a.z += (dz / d) * stepLen;
      // smooth turning
      const want = Math.atan2(dx, dz);
      let diff = want - a.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      a.heading += diff * Math.min(1, dt * 8);
      a.phase += (stepLen / Math.max(0.6, k)) * 4.2; // stride follows distance covered
    }
    this.agents = this.agents.filter((a) => !(a.leaving && a.life <= 0));
  }
}
