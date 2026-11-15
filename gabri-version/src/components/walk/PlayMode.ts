/**
 * Play as your Trojan: the walking-tour character stands where you are. Up/W walks forward, left/right turn,
 * Shift runs. The map stays yours to pan and turn; click the character (or Follow) and the camera locks on,
 * riding behind it like a game chase cam, until you drag the map away again. It can't walk through
 * buildings: it slides along the walls instead. Esc (or the button) ends it.
 */
import mapboxgl from "mapbox-gl";
import type { Feature, FeatureCollection, Position } from "geojson";
import { CharacterLayer } from "./WalkGuide";
import { buildTrojan } from "./trojanModel";

type LL = { lng: number; lat: number };
type Ring = { pts: [number, number][]; minX: number; minZ: number; maxX: number; maxZ: number; h: number };

/** how close you can zoom while playing, and the map's normal limit */
const PLAY_MAX_ZOOM = 21.5;
const MAP_MAX_ZOOM = 19.5;
const WALK_MPS = 9; // quick, so getting across campus doesn't drag
const RUN_MPS = 20; // hold Shift
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
        const h = Number((f.properties as { h?: number } | null)?.h) || 12; // building height in meters
        const ring: Ring = { pts, minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs), h };
        if (ring.maxX - ring.minX > 2000) continue; // not a building
        for (let cx = Math.floor(ring.minX / CELL); cx <= Math.floor(ring.maxX / CELL); cx++)
          for (let cz = Math.floor(ring.minZ / CELL); cz <= Math.floor(ring.maxZ / CELL); cz++) {
            const k = `${cx},${cz}`;
            (this.grid.get(k) ?? this.grid.set(k, []).get(k)!).push(ring);
          }
      }
    }
  }
  /** height of the building standing at (x, z), 0 for open ground */
  heightAt(x: number, z: number) {
    let top = 0;
    for (const r of this.grid.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) ?? []) {
      if (r.h <= top || x < r.minX || x > r.maxX || z < r.minZ || z > r.maxZ) continue;
      let c = false;
      for (let i = 0, j = r.pts.length - 1; i < r.pts.length; j = i++) {
        const [xi, zi] = r.pts[i], [xj, zj] = r.pts[j];
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
      }
      if (c) top = r.h;
    }
    return top;
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
  /** camera locked behind the character (click the character to lock, drag the map to let go) */
  private follow = false;
  /** playing (keys drive it, camera follows) vs parked (it just stands where you left it) */
  private active = true;
  /** mid-air during a recall: the flight owns the position */
  private flying = false;
  get isActive() { return this.active && !this.gone; }

  constructor(private map: mapboxgl.Map, start: LL, buildings: (FeatureCollection | null | undefined)[], private onExit: () => void, private onFollow: (on: boolean) => void = () => {}) {
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
    this.layer.id = "play-character"; // its own layer: a tour's guide can be on the map at the same time
    if (map.getLayer(this.layer.id)) map.removeLayer(this.layer.id);
    map.addLayer(this.layer);
    this.hdg = map.getBearing();
    this.layer.heading = this.hdg + 180; // turns to wave at you first, then you see it from behind
    this.layer.play("Wave", true);
    setTimeout(() => { if (!this.moving) this.layer?.play("Idle"); }, 1600); // unless you already started walking
    map.keyboard.disable(); // arrows drive the character, not the map
    this.closeZoom(true);
    this.flyIn();
    window.addEventListener("keydown", this.down, true); // capture: the character hears its keys before the page's other shortcuts do
    window.addEventListener("keyup", this.up, true);
    window.addEventListener("blur", this.clear);
    // free camera unless you lock on: drag the map to let go, click the character to follow it
    map.on("dragstart", this.letGo);
    map.on("rotatestart", this.letGo);
    map.on("click", this.clickChar);
    map.on("mousemove", this.hoverChar);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  /** the camera flies in behind the character */
  private flyIn() {
    const map = this.map;
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
  }

  setLight(preset: string | undefined) { this.layer?.setLight(preset); }

  /** Stop playing but leave the Trojan standing where it is. */
  park() {
    if (!this.active || this.gone) return;
    this.active = false;
    this.closeZoom(false);
    this.setFollow(false);
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.down, true);
    window.removeEventListener("keyup", this.up, true);
    window.removeEventListener("blur", this.clear);
    this.keys.clear();
    this.stick = { x: 0, y: 0 };
    this.moving = false;
    this.layer?.play("Idle");
    this.map.keyboard.enable();
    this.map.easeTo({ padding: { top: 0, bottom: 0, left: 0, right: 0 }, pitch: Math.min(this.map.getPitch(), 60), duration: 600 });
  }

  /** Back to the parked Trojan: the camera flies to it and you are playing again. */
  resume() {
    if (this.active || this.gone) return;
    this.active = true;
    this.closeZoom(true);
    this.map.keyboard.disable();
    this.flyIn();
    window.addEventListener("keydown", this.down, true); // capture: the character hears its keys before the page's other shortcuts do
    window.addEventListener("keyup", this.up, true);
    window.addEventListener("blur", this.clear);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  /** nearest spot to (x, z) that is not inside a building */
  private openSpot(x: number, z: number): [number, number] {
    if (!this.walls.blocked(x, z)) return [x, z];
    for (let r = 2; r < 120; r += 2) for (let a = 0; a < 24; a++) {
      const nx = x + Math.cos((a / 24) * Math.PI * 2) * r, nz = z + Math.sin((a / 24) * Math.PI * 2) * r;
      if (!this.walls.blocked(nx, nz)) return [nx, nz];
    }
    return [x, z];
  }

  /** Pick the Trojan up, carry it through the air in an arc and drop it at `to` (a double tap on the helmet). */
  recall(to: LL) {
    if (this.gone || !this.layer || this.flying) return;
    const layer = this.layer;
    const [tx, tz] = this.openSpot(...this.walls.toXZ(to.lng, to.lat));
    const from = this.walls.toLL(this.x, this.z), dest = this.walls.toLL(tx, tz);
    const dist = Math.hypot(tx - this.x, tz - this.z);
    const UP = 380, DOWN = 420, TRAVEL = Math.min(1600, 600 + dist * 1.2);
    const peak = Math.min(60, 18 + dist * 0.04); // meters in the air
    this.flying = true;
    this.hdg = (Math.atan2(tx - this.x, -(tz - this.z)) * 180) / Math.PI;
    layer.heading = this.hdg;
    layer.play("Idle");
    const t0 = performance.now();
    const easeOut = (t: number) => 1 - (1 - t) ** 3;
    const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
    const bounce = (t: number) => { const n = 7.5625, d = 2.75; if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75; if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375; return n * (t -= 2.625 / d) * t + 0.984375; };
    // the camera follows the flight (from above, so the whole arc is in view)
    this.map.easeTo({ center: [dest.lng, dest.lat], duration: UP + TRAVEL, pitch: Math.min(this.map.getPitch(), 60), essential: true });
    const step = (now: number) => {
      if (this.gone) return;
      const e = now - t0;
      if (e < UP) {
        layer.lift = peak * easeOut(e / UP); // picked up
      } else if (e < UP + TRAVEL) {
        const k = easeInOut((e - UP) / TRAVEL);
        layer.pos = { lat: from.lat + (dest.lat - from.lat) * k, lng: from.lng + (dest.lng - from.lng) * k };
        layer.lift = peak + Math.sin(k * Math.PI) * peak * 0.35; // a little arc on the way
      } else if (e < UP + TRAVEL + DOWN) {
        layer.pos = dest;
        layer.lift = peak * (1 - bounce((e - UP - TRAVEL) / DOWN)); // dropped, with a bounce
      } else {
        layer.lift = 0;
        layer.pos = dest;
        this.x = tx; this.z = tz;
        this.flying = false;
        layer.play("Wave", true);
        setTimeout(() => { if (!this.moving) this.layer?.play("Idle"); }, 1600);
        if (this.active) this.followAt = performance.now() + 300;
        return;
      }
      this.map.triggerRepaint();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
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
    if (this.flying) { this.last = now; this.raf = requestAnimationFrame(this.tick); return; }
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
    // chase cam (once you've clicked the character): stays on it and swings round behind it as it turns
    if (this.follow && now > this.followAt && !this.map.isEasing()) {
      const b = this.map.getBearing();
      const diff = ((this.hdg - b + 540) % 360) - 180;
      const bearing = Math.abs(diff) < 0.05 ? this.hdg : b + diff * Math.min(1, dt * 6);
      this.map.jumpTo({ center: [p.lng, p.lat], bearing });
    } else this.map.triggerRepaint();
    this.checkSight(now);
    this.raf = requestAnimationFrame(this.tick);
  };

  /** Playing: allow zooming right in on the character (the map normally stops at 19.5). */
  private closeZoom(on: boolean) {
    try { this.map.setMaxZoom(on ? PLAY_MAX_ZOOM : MAP_MAX_ZOOM); } catch { /* map gone */ }
  }

  /**
   * Line of sight: trace from the camera to the character's head over the real building heights.
   * If a building actually blocks it, the camera eases a little closer and looks a little more from
   * above until the Trojan is in view (nothing turns transparent). Checked a few times a second.
   */
  private sightAt = 0;
  private checkSight(now: number) {
    if (now < this.sightAt || this.map.isEasing() || this.flying) return;
    this.sightAt = now + 350;
    const cam = this.map.getFreeCameraOptions().position;
    if (!cam) return;
    const camLL = cam.toLngLat(), camAlt = cam.toAltitude();
    const [cx, cz] = this.walls.toXZ(camLL.lng, camLL.lat);
    const head = 2 * DRAW_SCALE * 0.75; // meters: the drawn Trojan's chest/head
    const dist = Math.hypot(this.x - cx, this.z - cz);
    if (dist < 4) return;
    const steps = Math.min(120, Math.ceil(dist / 2.5));
    let blocked = false;
    for (let i = 1; i < steps - 1 && !blocked; i++) {
      const t = i / steps;
      const x = cx + (this.x - cx) * t, z = cz + (this.z - cz) * t;
      const sight = camAlt + (head - camAlt) * t; // height of the line of sight here
      const h = this.walls.heightAt(x, z);
      if (h > sight + 0.5) blocked = true;
    }
    if (!blocked) return;
    const zoom = this.map.getZoom(), pitch = this.map.getPitch();
    if (zoom >= PLAY_MAX_ZOOM - 0.3 && pitch <= 40) return; // already as close and as high as it goes
    const me = this.position(); // zoom toward the Trojan itself, followed or not
    this.map.easeTo({ zoom: Math.min(PLAY_MAX_ZOOM - 0.3, zoom + 0.45), pitch: Math.max(40, pitch - 7), around: [me.lng, me.lat], duration: 420, essential: true });
    this.sightAt = now + 520;
  }

  /** lock the camera behind the character, or let the map go free */
  setFollow(on: boolean) {
    if (this.gone || on === this.follow || (on && !this.active)) return;
    this.follow = on;
    if (on) {
      const p = this.position();
      this.map.easeTo({ center: [p.lng, p.lat], bearing: this.hdg, pitch: Math.max(this.map.getPitch(), 62), duration: 600, essential: true });
      this.followAt = performance.now() + 620;
    }
    this.onFollow(on);
  }
  // you grabbed the map: the camera stops chasing (only real drags, not the chase cam's own moves)
  private letGo = (e: { originalEvent?: unknown }) => { if (e.originalEvent) this.setFollow(false); };
  /** is a screen point on the character? (it's drawn standing up from its feet, so the box reaches up) */
  onChar(pt: { x: number; y: number }) {
    const p = this.position();
    const s = this.map.project([p.lng, p.lat]);
    const mpp = (78_271.517 * Math.cos((p.lat * Math.PI) / 180)) / 2 ** this.map.getZoom();
    const tall = Math.max(28, (2 * DRAW_SCALE) / mpp);
    return Math.abs(pt.x - s.x) < Math.max(18, tall * 0.35) && pt.y < s.y + 12 && pt.y > s.y - tall - 8;
  }
  private clickChar = (e: mapboxgl.MapMouseEvent) => { if (this.active && this.onChar(e.point)) this.setFollow(true); };
  private hoverChar = (e: mapboxgl.MapMouseEvent) => {
    const on = this.active && this.onChar(e.point);
    const c = this.map.getCanvas();
    if (on) c.style.cursor = "pointer";
    else if (c.style.cursor === "pointer" && !this.map.getCanvasContainer().matches(":active")) c.style.cursor = "";
  };
  /** Jump to a spot (a tap on the map): lands on the nearest open ground if that spot is inside a building. */
  moveTo(ll: LL) {
    if (this.gone || this.flying) return;
    const [x, z] = this.openSpot(...this.walls.toXZ(ll.lng, ll.lat));
    // face where you were heading, then glide the camera over
    this.hdg = (Math.atan2(x - this.x, -(z - this.z)) * 180) / Math.PI;
    this.x = x; this.z = z;
    this.started = true;
    const p = this.walls.toLL(x, z);
    if (this.layer) { this.layer.pos = p; this.layer.heading = this.hdg; }
    this.followAt = performance.now() + 650;
    this.map.easeTo({ center: [p.lng, p.lat], bearing: this.hdg, duration: 600, essential: true });
  }

  /** where the character stands now (a tour started while playing begins here) */
  position(): LL { return this.walls.toLL(this.x, this.z); }

  destroy() {
    this.closeZoom(false);
    this.gone = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.down, true);
    window.removeEventListener("keyup", this.up, true);
    window.removeEventListener("blur", this.clear);
    this.map.off("dragstart", this.letGo);
    this.map.off("rotatestart", this.letGo);
    this.map.off("click", this.clickChar);
    this.map.off("mousemove", this.hoverChar);
    try {
      this.map.keyboard.enable();
      this.map.easeTo({ padding: { top: 0, bottom: 0, left: 0, right: 0 }, pitch: Math.min(this.map.getPitch(), 60), duration: 600 });
      if (this.layer && this.map.getLayer(this.layer.id)) this.map.removeLayer(this.layer.id);
    } catch { /* map already gone */ }
    this.layer = null;
  }
}
