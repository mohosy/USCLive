"use client";

/**
 * Cute crowds: when you zoom into a busy spot, little Trojans and students hang out around it,
 * walking about, waving, cheering and dancing. Busier spots get more people and more partying.
 *
 * One Mapbox custom layer draws everyone in a single three.js scene. Performance:
 * - each look is baked once (low-poly, ~16 draw calls per character) and cloned with shared geometry;
 * - the layer only renders and asks for repaints while there are characters to show (zoomed in, crowds on);
 * - at most MAX_PEOPLE characters, only for spots on screen.
 */
import mapboxgl from "mapbox-gl";
import * as THREE from "three";
import { bakeCrowdLook, crowdClips, CROWD_LOOKS } from "./trojanModel";

export const CROWD_MIN_ZOOM = 17;
const MAX_PEOPLE = 42;
const MODEL_H = 2; // the baked models are ~2 units tall

export interface CrowdSpot {
  id: string;
  lng: number;
  lat: number;
  count: number;
  level: "quiet" | "normal" | "busy" | "packed";
}

type Act = "Walk" | "Idle" | "Wave" | "Happy" | "Cheer" | "Dance" | "Read";

interface Person {
  spot: string;
  obj: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Partial<Record<Act, THREE.AnimationAction>>;
  act: Act | null;
  x: number; // meters east of the layer origin
  z: number; // meters south of the layer origin
  ax: number; // home anchor (an open spot near the building)
  az: number;
  tx: number;
  tz: number;
  heading: number; // radians, three.js y-rotation
  until: number; // seconds: when the current activity ends
  pace: number;
  size: number; // per-person height jitter
  reads: boolean;
  level: CrowdSpot["level"];
  leaving: boolean;
  fade: number;
}

// what people do between strolls, by how busy the spot is
const MOOD: Record<CrowdSpot["level"], [Act, number][]> = {
  quiet: [["Idle", 3], ["Read", 3], ["Wave", 1], ["Happy", 1]],
  normal: [["Idle", 2], ["Happy", 2], ["Wave", 2], ["Read", 1], ["Dance", 1]],
  busy: [["Happy", 2], ["Wave", 2], ["Dance", 2], ["Cheer", 1], ["Idle", 1]],
  packed: [["Cheer", 3], ["Dance", 3], ["Wave", 1], ["Happy", 1]],
};
const peopleFor = (s: CrowdSpot) => {
  const base = { quiet: 2, normal: 4, busy: 7, packed: 10 }[s.level];
  return Math.max(2, Math.min(12, Math.round(base + s.count / 120)));
};

function pick<T>(items: [T, number][]): T {
  let r = Math.random() * items.reduce((a, [, w]) => a + w, 0);
  for (const [v, w] of items) if ((r -= w) <= 0) return v;
  return items[0][0];
}

export class CrowdLayer implements mapboxgl.CustomLayerInterface {
  id = "crowd-people";
  type = "custom" as const;
  renderingMode = "3d" as const;
  private map: mapboxgl.Map | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private camera = new THREE.Camera();
  private scene = new THREE.Scene();
  private origin = mapboxgl.MercatorCoordinate.fromLngLat([-118.2851, 34.0208], 0);
  private originLL = { lng: -118.2851, lat: 34.0208 };
  private people: Person[] = [];
  private templates: THREE.Group[] = [];
  private loading: Promise<void> | null = null;
  private spots: CrowdSpot[] = [];
  private clock = new THREE.Clock();
  private t = 0;
  private height = 3; // current on-screen-friendly character height (m)
  private shadowGeo = new THREE.CircleGeometry(0.45, 20);
  private shadowMat = new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.22, depthWrite: false });
  enabled = true;

  constructor() {
    this.scene.add(new THREE.HemisphereLight("#ffffff", "#8a7f6e", 1.7));
    const sun = new THREE.DirectionalLight("#fff4e0", 1.9);
    sun.position.set(-40, 80, 30);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight("#fff1e2", 0.7);
    fill.position.set(30, 40, 60);
    this.scene.add(fill);
  }

  onAdd(map: mapboxgl.Map, gl: WebGL2RenderingContext) {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;
    this.clock.start();
  }

  onRemove() {
    this.renderer = null;
    this.map = null;
  }

  /** Busy spots to populate (already filtered to what's on screen). Characters come and go smoothly. */
  setSpots(spots: CrowdSpot[]) {
    this.spots = spots;
    if (!spots.length) {
      for (const p of this.people) p.leaving = true;
      this.map?.triggerRepaint();
      return;
    }
    this.ensureTemplates().then(() => this.sync());
  }

  private ensureTemplates() {
    this.loading ??= Promise.all(CROWD_LOOKS.map((l) => bakeCrowdLook(l))).then((t) => void (this.templates = t));
    return this.loading;
  }

  private sync() {
    const m = this.map;
    if (!m) return;
    const want = new Map<string, number>();
    let budget = MAX_PEOPLE;
    // the spots nearest the middle of the screen first, so people are where you're looking
    const c = m.getCenter();
    const here = this.local(c.lng, c.lat);
    const dist = (s: CrowdSpot) => { const p = this.local(s.lng, s.lat); return Math.hypot(p.x - here.x, p.z - here.z); };
    for (const s of [...this.spots].sort((a, b) => dist(a) - dist(b))) {
      const n = Math.min(budget, peopleFor(s));
      want.set(s.id, n);
      budget -= n;
    }
    for (const p of this.people) {
      const n = want.get(p.spot) ?? 0;
      if (n > 0) want.set(p.spot, n - 1);
      else p.leaving = true;
    }
    for (const s of this.spots) {
      const n = want.get(s.id) ?? 0;
      if (n <= 0) continue;
      const anchors = this.openAnchors(s, n);
      for (let i = 0; i < n; i++) this.spawn(s, anchors[i % anchors.length]);
    }
    m.triggerRepaint();
  }

  /** Points around the building that aren't inside one (buildings hide whoever stands in them). */
  private openAnchors(s: CrowdSpot, n: number): { x: number; z: number }[] {
    const m = this.map!;
    const c = this.local(s.lng, s.lat);
    const out: { x: number; z: number }[] = [];
    const tries = Math.max(16, n * 4);
    const off = Math.random() * Math.PI * 2;
    for (let i = 0; i < tries && out.length < n; i++) {
      const a = off + (i / tries) * Math.PI * 2 * 2.618;
      const r = 26 + (i % 4) * 9;
      const p = { x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r };
      if (this.isOpen(m, p)) out.push(p);
    }
    if (!out.length) out.push({ x: c.x + 30, z: c.z });
    return out;
  }

  private isOpen(m: mapboxgl.Map, p: { x: number; z: number }) {
    const ll = this.lngLat(p.x, p.z);
    const px = m.project([ll.lng, ll.lat]);
    const cv = m.getCanvas();
    if (px.x < 0 || px.y < 0 || px.x > cv.clientWidth || px.y > cv.clientHeight) return true; // can't check off-screen
    try {
      const hits = m.queryRenderedFeatures([px.x, px.y], { target: { featuresetId: "buildings", importId: "basemap" } } as never);
      return hits.length === 0;
    } catch {
      return true;
    }
  }

  private spawn(s: CrowdSpot, a: { x: number; z: number }) {
    if (!this.templates.length) return;
    const look = Math.floor(Math.random() * this.templates.length);
    const obj = this.templates[look].clone(true);
    const shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    obj.add(shadow);
    const mixer = new THREE.AnimationMixer(obj);
    const actions: Person["actions"] = {};
    for (const c of crowdClips()) actions[c.name as Act] = mixer.clipAction(c);
    const jitter = () => (Math.random() - 0.5) * 6;
    const p: Person = {
      spot: s.id, obj, mixer, actions, act: null,
      x: a.x + jitter(), z: a.z + jitter(), ax: a.x, az: a.z, tx: a.x, tz: a.z,
      heading: Math.random() * Math.PI * 2, until: this.t + Math.random() * 2,
      pace: 0.85 + Math.random() * 0.35, size: 0.9 + Math.random() * 0.18,
      reads: ["phone", "book"].includes(CROWD_LOOKS[look].prop ?? ""),
      level: s.level, leaving: false, fade: 0,
    };
    mixer.timeScale = 0.9 + Math.random() * 0.25;
    this.play(p, "Idle");
    p.actions.Idle!.time = Math.random() * 2; // desync the crowd
    this.scene.add(obj);
    this.people.push(p);
  }

  private play(p: Person, act: Act) {
    const next = p.actions[act];
    if (!next || p.act === act) return;
    next.reset();
    if (act === "Wave") {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
    } else next.setLoop(THREE.LoopRepeat, Infinity);
    next.play();
    const prev = p.act ? p.actions[p.act] : null;
    if (prev) prev.crossFadeTo(next, 0.3, false);
    p.act = act;
  }

  /** Decide what someone does next: wander a few steps, or do something fun for a bit. */
  private next(p: Person) {
    if (p.act !== "Walk" && Math.random() < 0.55) {
      const r = this.height * (1.2 + Math.random() * 1.8);
      const a = Math.random() * Math.PI * 2;
      p.tx = p.ax + Math.cos(a) * r;
      p.tz = p.az + Math.sin(a) * r;
      this.play(p, "Walk");
      p.until = Infinity;
      return;
    }
    let act = pick(MOOD[p.level]);
    if (act === "Read" && !p.reads) act = "Idle";
    this.play(p, act);
    p.until = this.t + (act === "Wave" ? 3 : 2.5 + Math.random() * 3.5);
  }

  private local(lng: number, lat: number) {
    const k = 111_320;
    return { x: (lng - this.originLL.lng) * k * Math.cos((this.originLL.lat * Math.PI) / 180), z: -(lat - this.originLL.lat) * 110_540 };
  }
  private lngLat(x: number, z: number) {
    return { lng: this.originLL.lng + x / (111_320 * Math.cos((this.originLL.lat * Math.PI) / 180)), lat: this.originLL.lat - z / 110_540 };
  }

  render(_gl: WebGL2RenderingContext, matrix: number[]) {
    const m = this.map;
    if (!this.renderer || !m) return;
    const dt = Math.min(0.1, this.clock.getDelta());
    if (!this.people.length) return; // nothing to draw: no repaint loop, zero cost
    this.t += dt;

    // characters stay ~40px tall on screen (never smaller than life), so they read at any zoom
    const mpp = (40_075_016.686 * Math.cos((this.originLL.lat * Math.PI) / 180)) / (512 * 2 ** m.getZoom());
    this.height = Math.min(16, Math.max(3.6, 46 * mpp));
    const show = this.enabled && m.getZoom() >= CROWD_MIN_ZOOM - 0.3;

    for (let i = this.people.length - 1; i >= 0; i--) {
      const p = this.people[i];
      const target = p.leaving || !show ? 0 : 1;
      p.fade += Math.sign(target - p.fade) * Math.min(Math.abs(target - p.fade), dt * 3);
      if (p.leaving && p.fade <= 0) {
        this.scene.remove(p.obj);
        p.mixer.stopAllAction();
        this.people.splice(i, 1);
        continue;
      }
      if (this.t >= p.until) this.next(p);
      if (p.act === "Walk") {
        const dx = p.tx - p.x;
        const dz = p.tz - p.z;
        const d = Math.hypot(dx, dz);
        const step = this.height * 0.75 * p.pace * dt;
        if (d <= step) {
          p.x = p.tx;
          p.z = p.tz;
          p.until = this.t; // arrived: pick something to do
        } else {
          p.x += (dx / d) * step;
          p.z += (dz / d) * step;
          const want = Math.atan2(dx, dz);
          const diff = Math.atan2(Math.sin(want - p.heading), Math.cos(want - p.heading));
          p.heading += diff * Math.min(1, dt * 8);
        }
      }
      p.mixer.update(dt);
      const s = (this.height / MODEL_H) * p.size * (0.4 + 0.6 * p.fade);
      p.obj.scale.setScalar(s);
      p.obj.position.set(p.x, 0, p.z);
      p.obj.rotation.y = p.heading;
      p.obj.visible = p.fade > 0.01;
    }
    if (!this.people.length) return;

    const sc = this.origin.meterInMercatorCoordinateUnits();
    const l = new THREE.Matrix4()
      .makeTranslation(this.origin.x, this.origin.y, this.origin.z)
      .scale(new THREE.Vector3(sc, -sc, sc))
      .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    this.camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix).multiply(l);
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    if (show || this.people.some((p) => p.fade > 0)) m.triggerRepaint();
  }
}
