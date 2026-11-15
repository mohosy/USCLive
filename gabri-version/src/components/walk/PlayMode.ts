/**
 * Play as your Trojan: the walking-tour character stands where you are. Up/W walks forward, left/right turn,
 * Shift runs, and the camera rides behind the character like a game chase cam. It can't walk through
 * buildings: it slides along the walls instead. Esc (or the button) ends it.
 */
import mapboxgl from "mapbox-gl";
import type { Feature, FeatureCollection, Position } from "geojson";
import { CharacterLayer } from "./WalkGuide";
import { buildTrojan } from "./trojanModel";

type LL = { lng: number; lat: number };
type Ring = { pts: [number, number][]; minX: number; minZ: number; maxX: number; maxZ: number };

const WALK_MPS = 9; // a jog: campus is big, so walking around shouldn't drag
const RUN_MPS = 18;
const BODY_M = 1.8; // keeps the (drawn larger) character off the walls
const DRAW_SCALE = 2.8; // the Trojan is drawn bigger than life so it reads like a game character
const CELL = 40;
const TURN_DPS = 170; // how fast left/right turns the character (degrees per second)

/** Building footprints in local meters (x east, z south), bucketed on a grid so collision checks stay cheap. */
class Walls {
  private grid = new Map<string, Ring[]>();
  constructor(private lat0: number, private lng0: number) {}
  private kx() { return 111_320 * Math.cos((this.lat0 * Math.PI) / 180); }
  toXZ(lng: number, lat: number): [number, number] { return [(lng - this.lng0) * this.kx(), -(lat - this.lat0) * 110_574]; }
  toLL(x: number, z: number): LL { return { lng: this.lng0 + x / this.kx(), lat: this.lat0 - z / 110_574 }; }
  add(fc: FeatureCollection | null | undefined) {
    if (!fc) return;
    for (const f of fc.features as Feature[]) {
      const g = f.geometry;
      const rings: Position[][] = g.type === "Polygon" ? [g.coordinates[0]] : g.type === "MultiPolygon" ? g.coordinates.map((p) => p[0]) : [];
      for (const r of rings) {
        const pts = r.map(([lng, lat]) => this.toXZ(lng, lat));
        const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
        const ring: Ring = { pts, minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
        if (ring.maxX - ring.minX > 2000) continue; // not a building
        for (let cx = Math.floor(ring.minX / CELL); cx <= Math.floor(ring.maxX / CELL); cx++)
          for (let cz = Math.floor(ring.minZ / CELL); cz <= Math.floor(ring.maxZ / CELL); cz++) {
            const k = `${cx},${cz}`;
            (this.grid.get(k) ?? this.grid.set(k, []).get(k)!).push(ring);
          }
      }
    }
  }
  private inside(x: number, z: number) {
    for (const r of this.grid.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) ?? []) {
      if (x < r.minX || x > r.maxX || z < r.minZ || z > r.maxZ) continue;
      let c = false;
      for (let i = 0, j = r.pts.length - 1; i < r.pts.length; j = i++) {
        const [xi, zi] = r.pts[i], [xj, zj] = r.pts[j];
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
      }
      if (c) return true;
    }
    return false;
  }
  /** blocked if the body (a small circle) would touch a building */
  blocked(x: number, z: number) {
    return this.inside(x, z) || this.inside(x + BODY_M, z) || this.inside(x - BODY_M, z) || this.inside(x, z + BODY_M) || this.inside(x, z - BODY_M);
  }
}

export class PlayMode {
  private layer: CharacterLayer | null = null;
  private walls: Walls;
  private x = 0;
  private z = 0;
  private keys = new Set<string>();
  /** on-screen stick: -1..1 on each axis (screen right, screen up) */
  stick = { x: 0, y: 0 };
  private raf = 0;
  private last = 0;
  private moving = false;
  private gone = false;
  private followAt = 0;
  /** where the character faces (compass degrees); the camera looks the same way, from behind */
  private hdg = 0;
  private started = false;

  constructor(private map: mapboxgl.Map, start: LL, buildings: (FeatureCollection | null | undefined)[], private onExit: () => void) {
    this.walls = new Walls(start.lat, start.lng);
    for (const fc of buildings) this.walls.add(fc);
    // if "you" are standing inside a building's footprint, step out to the nearest open spot
    if (this.walls.blocked(0, 0)) {
      outer: for (let r = 2; r < 80; r += 2) for (let a = 0; a < 16; a++) {
        const x = Math.cos((a / 16) * Math.PI * 2) * r, z = Math.sin((a / 16) * Math.PI * 2) * r;
        if (!this.walls.blocked(x, z)) { this.x = x; this.z = z; break outer; }
      }
    }
    this.layer = new CharacterLayer(buildTrojan(), this.walls.toLL(this.x, this.z));
    this.layer.scale = DRAW_SCALE;
    this.layer.alwaysOnTop = true;
    if (map.getLayer(this.layer.id)) map.removeLayer(this.layer.id);
    map.addLayer(this.layer);
    this.hdg = map.getBearing();
    this.layer.heading = this.hdg + 180; // turns to wave at you first, then you see it from behind
    this.layer.play("Wave", true);
    setTimeout(() => { if (!this.moving) this.layer?.play("Idle"); }, 1600); // unless you already started walking
    map.keyboard.disable(); // arrows drive the character, not the map
    const p = this.walls.toLL(this.x, this.z);
    // fly in to the character (after any camera move already running, like the opening flight)
    const fly = () => {
      if (this.gone) return;
      // the character sits in the lower part of the screen with the street ahead of it, like a game
      const h = map.getContainer().clientHeight;
      map.easeTo({ center: [p.lng, p.lat], zoom: 19.3, pitch: 70, bearing: this.hdg, padding: { top: Math.round(h * 0.38), bottom: 0, left: 0, right: 0 }, duration: 1200, essential: true });
      this.followAt = performance.now() + 1250; // start following once the camera has flown in
    };
    this.followAt = Infinity;
    if (map.isMoving() || map.isEasing()) map.once("moveend", fly);
    else fly();
    // capture: the character hears its keys before the page's other shortcuts do
    window.addEventListener("keydown", this.down, true);
    window.addEventListener("keyup", this.up, true);
    window.addEventListener("blur", this.clear);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  private down = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (e.key === "Escape") { this.onExit(); return; }
    const k = e.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d", "shift"].includes(k)) {
      this.keys.add(k);
      e.preventDefault();
      e.stopImmediatePropagation(); // W also cycles the demo weather; while you play it only walks
    }
  };
  private up = (e: KeyboardEvent) => { this.keys.delete(e.key.toLowerCase()); };
  private clear = () => { this.keys.clear(); };

  private tick = (now: number) => {
    if (this.gone || !this.layer) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const k = this.keys;
    // tank controls: up/down walk forward/back, left/right turn
    const turn = (k.has("arrowright") || k.has("d") ? 1 : 0) - (k.has("arrowleft") || k.has("a") ? 1 : 0) + this.stick.x;
    const fwd = (k.has("arrowup") || k.has("w") ? 1 : 0) - (k.has("arrowdown") || k.has("s") ? 1 : 0) + this.stick.y;
    const t = Math.max(-1, Math.min(1, turn)), f = Math.max(-1, Math.min(1, fwd));
    const walking = Math.abs(f) > 0.08, turning = Math.abs(t) > 0.08;
    const going = walking || turning;
    if (going && !this.started) { this.started = true; this.layer.heading = this.hdg; }
    if (turning) this.hdg = (this.hdg + t * TURN_DPS * dt + 360) % 360;
    if (walking) {
      const r = (this.hdg * Math.PI) / 180;
      const speed = (k.has("shift") ? RUN_MPS : WALK_MPS) * f * (f < 0 ? 0.5 : 1); // backing up is slower
      const dx = Math.sin(r) * speed * dt, dz = -Math.cos(r) * speed * dt; // local frame: x east, z south
      // move, sliding along walls when one axis is blocked
      if (!this.walls.blocked(this.x + dx, this.z + dz)) { this.x += dx; this.z += dz; }
      else if (!this.walls.blocked(this.x + dx, this.z)) this.x += dx;
      else if (!this.walls.blocked(this.x, this.z + dz)) this.z += dz;
    }
    if (this.started) this.layer.heading = this.hdg;
    this.layer.timeScale = !walking ? 1.4 : k.has("shift") ? 3.4 : 2.5;
    if (going !== this.moving) { this.moving = going; this.layer.play(going ? "Walk" : "Idle"); }
    const p = this.walls.toLL(this.x, this.z);
    this.layer.pos = p;
    // chase cam: stays on the character and swings round behind it as it turns (zoom and tilt stay yours)
    if (now > this.followAt && !this.map.isEasing()) {
      const b = this.map.getBearing();
      const diff = ((this.hdg - b + 540) % 360) - 180;
      const bearing = Math.abs(diff) < 0.05 ? this.hdg : b + diff * Math.min(1, dt * 6);
      this.map.jumpTo({ center: [p.lng, p.lat], bearing });
    } else this.map.triggerRepaint();
    this.raf = requestAnimationFrame(this.tick);
  };

  /** where the character stands now (a tour started while playing begins here) */
  position(): LL { return this.walls.toLL(this.x, this.z); }

  destroy() {
    this.gone = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.down, true);
    window.removeEventListener("keyup", this.up, true);
    window.removeEventListener("blur", this.clear);
    try {
      this.map.keyboard.enable();
      this.map.easeTo({ padding: { top: 0, bottom: 0, left: 0, right: 0 }, pitch: Math.min(this.map.getPitch(), 60), duration: 600 });
      if (this.layer && this.map.getLayer(this.layer.id)) this.map.removeLayer(this.layer.id);
    } catch { /* map already gone */ }
    this.layer = null;
  }
}
