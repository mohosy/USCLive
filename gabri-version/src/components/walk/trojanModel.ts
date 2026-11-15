"use client";

/**
 * Procedural Trojan mascot for the walking tours: gold crested helmet, big grin, gold armor, red cape, short sword.
 * Built from three.js primitives (no external asset) with hand-keyed clips:
 *   "Idle"  – breathing, small smile
 *   "Walk"  – stride cycle (also exported as "Walking")
 *   "Wave"  – hop, right arm up and waving, big toothy grin (play once)
 *   "Happy" – idle with the big grin, after the wave
 * Faces +Z, y-up, feet at y = 0, ~2 units tall.
 *
 * The same kit builds the crowd cast (CROWD_LOOKS): Trojan guys and girls, students in team tees and hoodies,
 * with caps, hair styles and props, plus extra clips "Cheer", "Dance" and "Read".
 */
import * as THREE from "three";

export interface CharacterAsset {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

/** Everything that makes one character look different. The default is the mascot. */
export interface Look {
  body: "m" | "f";
  skin: string;
  hat: "helmet" | "cap" | "none";
  hair?: { style: "short" | "curly" | "ponytail" | "bun" | "long"; color: string };
  plume?: string;
  capColor?: string;
  outfit: "armor" | "tee" | "hoodie";
  top?: string;
  bottom?: string;
  bottomStyle?: "shorts" | "skirt" | "pants";
  cape?: string | null;
  prop?: "sword" | "backpack" | "boba" | "book" | "phone" | "football" | "pompoms" | "none";
  brows?: "bold" | "friendly";
  blush?: boolean;
}

export const MASCOT: Look = { body: "m", skin: "#ffd2a6", hat: "helmet", plume: "#b0102a", outfit: "armor", cape: "#a3001b", prop: "sword", brows: "bold" };

const C = {
  gold: "#d9a531",
  goldDark: "#8a5f14",
  red: "#a3001b",
  brown: "#5a3a22",
  white: "#ffffff",
  ink: "#1d1410",
  mouth: "#4a0f12",
  steel: "#c9ced6",
  blush: "#ff8f8f",
};

// one material per look-colour (cached), named so the walk layer can give metals reflections
const matCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(name: string, color: string, o: { roughness?: number; metalness?: number; env?: number; double?: boolean; emissive?: string } = {}) {
  const key = `${name}|${color}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ name, color, roughness: o.roughness ?? 0.65, metalness: o.metalness ?? 0, side: o.double ? THREE.DoubleSide : THREE.FrontSide });
    if (o.env != null) m.envMapIntensity = o.env;
    if (o.emissive) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = 0.35; }
    matCache.set(key, m);
  }
  return m;
}
const M = {
  skin: (c: string) => mat("Skin", c, { roughness: 0.6, emissive: "#3a2010" }),
  gold: () => mat("Gold", C.gold, { roughness: 0.45, metalness: 0.3, env: 0.45 }),
  goldDark: () => mat("GoldDark", C.goldDark, { roughness: 0.55, metalness: 0.25, env: 0.4, double: true }),
  cloth: (c: string) => mat("Cloth", c, { roughness: 0.75, double: true }),
  plume: (c: string) => mat("Plume", c, { roughness: 0.8 }),
  brown: () => mat("Brown", C.brown, { roughness: 0.75 }),
  white: () => mat("White", C.white, { roughness: 0.3 }),
  ink: () => mat("Ink", C.ink, { roughness: 0.4 }),
  mouth: () => mat("Mouth", C.mouth, { roughness: 0.6 }),
  steel: () => mat("Steel", C.steel, { roughness: 0.2, metalness: 0.9 }),
  hair: (c: string) => mat("Hair", c, { roughness: 0.85, double: true }),
  blush: () => mat("Blush", C.blush, { roughness: 0.9 }),
};

// geometry detail: 1 for the hero, lower for crowds
let DETAIL = 1;
const sg = (n: number) => Math.max(5, Math.round(n * DETAIL));

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, name?: string) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (name) m.name = name;
  return m;
}
function group(name: string, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  return g;
}

// ---- head: an ellipsoid; face features are bent onto its surface ----
const HEAD_C = 0.3; // head center height inside the head group
const HR = { x: 0.285, y: 0.33, z: 0.29 };
function faceZ(x: number, y: number) {
  const k = 1 - (x / HR.x) ** 2 - ((y - HEAD_C) / HR.y) ** 2;
  return HR.z * Math.sqrt(Math.max(0, k));
}
/** Wrap a flat (xy) geometry onto the face, `off` in front of the skin. The mesh goes at (cx, cy, 0). */
function onFace(geo: THREE.BufferGeometry, mat: THREE.Material, cx: number, cy: number, off: number, name?: string) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, faceZ(p.getX(i) + cx, p.getY(i) + cy) + off + p.getZ(i));
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return mesh(geo, mat, cx, cy, 0, name);
}

function buildHair(head: THREE.Group, L: Look) {
  if (!L.hair) return;
  const hm = M.hair(L.hair.color);
  const style = L.hair.style;
  if (L.hat !== "helmet") {
    // cap of hair over the top and back, leaving the forehead clear
    const cap = mesh(new THREE.SphereGeometry(1, sg(28), sg(16), 0, Math.PI * 2, 0, Math.PI * 0.52), hm, 0, HEAD_C + 0.02, -0.015);
    cap.scale.set(HR.x + 0.022, HR.y + 0.02, HR.z + 0.03);
    cap.rotation.x = -0.62; // hairline above the brows, down to the nape at the back
    head.add(cap);
    if (style === "curly") {
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2;
        head.add(mesh(new THREE.SphereGeometry(0.085, sg(10), sg(8)), hm, Math.cos(a) * 0.2, 0.56 + Math.sin(a * 2) * 0.03, Math.sin(a) * 0.17 - 0.03));
      }
    }
    if (style === "bun") head.add(mesh(new THREE.SphereGeometry(0.12, sg(14), sg(10)), hm, 0, 0.7, -0.1));
    if (style === "long") {
      const back = mesh(new THREE.SphereGeometry(1, sg(18), sg(12)), hm, 0, 0.2, -0.17);
      back.scale.set(0.3, 0.4, 0.16);
      head.add(back);
      for (const side of [-1, 1]) {
        const lock = mesh(new THREE.SphereGeometry(1, sg(12), sg(8)), hm, 0.25 * side, 0.18, 0.02);
        lock.scale.set(0.07, 0.24, 0.1);
        head.add(lock);
      }
    }
  }
  if (style === "ponytail") {
    head.add(mesh(new THREE.SphereGeometry(0.06, sg(10), sg(8)), M.cloth(C.red), 0, 0.42, -0.31));
    [[0.35, -0.39, 0.1], [0.22, -0.42, 0.09], [0.1, -0.4, 0.075], [0.0, -0.36, 0.06]].forEach(([y, z, r]) => {
      const t = mesh(new THREE.SphereGeometry(r, sg(12), sg(8)), hm, 0, y, z);
      t.scale.set(0.85, 1.25, 0.9);
      head.add(t);
    });
  }
}

function buildHelmet(L: Look) {
  const helmet = group("helmet", 0, 0, 0);
  const band = mesh(new THREE.CylinderGeometry(0.3, 0.31, 0.2, sg(40), 1, true), M.gold(), 0, 0.52, 0);
  band.scale.z = 1.04;
  helmet.add(band);
  helmet.add(mesh(new THREE.CylinderGeometry(0.295, 0.305, 0.2, sg(40), 1, true), M.goldDark(), 0, 0.52, 0));
  const slats = DETAIL < 1 ? 10 : 14;
  for (let i = 0; i < slats; i++) {
    const a = (i / slats) * Math.PI * 2;
    const slat = mesh(new THREE.BoxGeometry(0.04, 0.13, 0.02), M.goldDark(), Math.sin(a) * 0.315, 0.52, Math.cos(a) * 0.325);
    slat.rotation.y = a;
    helmet.add(slat);
  }
  for (const [y, r] of [[0.62, 0.02], [0.42, 0.022]]) {
    const rim = mesh(new THREE.TorusGeometry(0.31, r, sg(8), sg(40)), M.gold(), 0, y, 0);
    rim.rotation.x = Math.PI / 2;
    helmet.add(rim);
  }
  const cap = mesh(new THREE.SphereGeometry(0.31, sg(32), sg(12), 0, Math.PI * 2, 0, Math.PI / 2), M.gold(), 0, 0.62, 0);
  cap.scale.y = 0.42;
  helmet.add(cap);
  for (const side of [-1, 1]) {
    const guard = mesh(new THREE.BoxGeometry(0.06, 0.2, 0.15), M.gold(), 0.29 * side, 0.3, 0.02);
    guard.rotation.z = 0.08 * side;
    helmet.add(guard);
    helmet.add(mesh(new THREE.SphereGeometry(0.04, sg(12), sg(8)), M.gold(), 0.3 * side, 0.42, 0.02));
  }
  helmet.add(mesh(new THREE.BoxGeometry(0.08, 0.06, 0.34), M.gold(), 0, 0.77, 0));
  // plume: a tall brush of feathers fanned front to back, splayed a little side to side
  const pm = M.plume(L.plume ?? "#b0102a");
  const per = DETAIL < 1 ? 5 : 7;
  for (let i = 0; i < per * 2; i++) {
    const t = (i % per) / (per - 1);
    const side = i < per ? -1 : 1;
    const h = 0.44 - Math.abs(t - 0.45) * 0.22;
    const f = mesh(new THREE.ConeGeometry(0.075, h, sg(10)), pm, 0.035 * side, 0.8 + h / 2, -0.15 + t * 0.3);
    f.scale.x = 0.6;
    f.rotation.set(-0.6 + t * 1.05, 0, -0.22 * side);
    helmet.add(f);
  }
  return helmet;
}

function buildCap(L: Look) {
  const c = L.capColor ?? C.red;
  const hat = group("cap", 0, 0, 0);
  const dome = mesh(new THREE.SphereGeometry(0.315, sg(28), sg(12), 0, Math.PI * 2, 0, Math.PI / 2), M.cloth(c), 0, 0.44, 0);
  dome.scale.y = 0.85;
  hat.add(dome);
  const bill = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.025, sg(20), 1, false, -Math.PI / 2, Math.PI), M.cloth(c), 0, 0.46, 0.22);
  bill.scale.set(1, 1, 1.3);
  bill.rotation.x = 0.12;
  hat.add(bill);
  hat.add(mesh(new THREE.SphereGeometry(0.035, sg(10), sg(6)), M.gold(), 0, 0.71, 0));
  // gold band so it reads as a team cap
  const band = mesh(new THREE.TorusGeometry(0.315, 0.018, sg(6), sg(32)), M.gold(), 0, 0.45, 0);
  band.rotation.x = Math.PI / 2;
  hat.add(band);
  return hat;
}

function buildHead(L: Look) {
  const f = L.body === "f";
  const head = group("head", 0, 0.6, 0.02);
  head.scale.setScalar(1.3); // mascot proportions: big head
  const skin = M.skin(L.skin);
  const skull = mesh(new THREE.SphereGeometry(1, sg(32), sg(24)), skin, 0, HEAD_C, 0);
  skull.scale.set(HR.x, HR.y, HR.z);
  head.add(skull);
  // jaw: square and heroic, softer for the girls
  const jaw = mesh(new THREE.SphereGeometry(1, sg(24), sg(16)), skin, 0, f ? 0.16 : 0.14, 0.03);
  jaw.scale.set(f ? 0.2 : 0.24, f ? 0.13 : 0.16, f ? 0.21 : 0.24);
  head.add(jaw);

  // eyes: big whites with pupils, in their own groups so they can squint
  const eyeR = f ? 1.1 : 1;
  for (const side of [-1, 1]) {
    const ex = 0.1 * side;
    const ey = 0.34;
    const eye = group(side < 0 ? "eyeL" : "eyeR", ex, ey, faceZ(ex, ey) - 0.02);
    const white = mesh(new THREE.SphereGeometry(1, sg(20), sg(14)), M.white());
    white.scale.set(0.072 * eyeR, 0.085 * eyeR, 0.04);
    eye.add(white);
    eye.add(mesh(new THREE.SphereGeometry(0.034 * eyeR, sg(14), sg(10)), M.ink(), -0.012 * side, -0.005, 0.034));
    if (f) {
      // lashes at the outer corner
      for (let k = 0; k < 3; k++) {
        const lash = mesh(new THREE.BoxGeometry(0.045, 0.014, 0.014), M.ink(), (0.06 + k * 0.012) * side, 0.06 - k * 0.022, 0.025);
        lash.rotation.z = (0.5 - k * 0.4) * side;
        eye.add(lash);
      }
    }
    head.add(eye);
    const bold = (L.brows ?? "friendly") === "bold";
    const brow = onFace(new THREE.BoxGeometry(f ? 0.11 : 0.13, f ? 0.022 : 0.032, 0.03), M.hair(L.hair?.color ?? C.ink), 0.105 * side, 0.46, 0.005);
    brow.rotation.z = (bold ? -0.32 : 0.14) * side;
    head.add(brow);
    if (L.blush) {
      const b = onFace(new THREE.CircleGeometry(0.045, sg(14)), M.blush(), 0.17 * side, 0.24, 0.006);
      b.scale.y = 0.65;
      head.add(b);
    }
  }
  const nose = mesh(new THREE.SphereGeometry(f ? 0.04 : 0.05, sg(14), sg(10)), skin, 0, 0.27, faceZ(0, 0.27) + 0.01);
  nose.scale.set(0.9, 1.2, 1);
  head.add(nose);

  // small smile (walk / idle) and a big toothy grin (arrival, cheering)
  const smileGeo = new THREE.TorusGeometry(f ? 0.07 : 0.085, 0.013, 6, sg(18), Math.PI);
  smileGeo.rotateZ(Math.PI);
  head.add(onFace(smileGeo, M.mouth(), 0, 0.19, 0.008, "smile"));
  const grin = group("grin");
  const grinMouth = new THREE.CircleGeometry(0.13, sg(28), Math.PI, Math.PI);
  grinMouth.scale(f ? 1.1 : 1.3, 0.8, 1);
  grin.add(onFace(grinMouth, M.mouth(), 0, 0.22, 0.006));
  grin.add(onFace(new THREE.PlaneGeometry(f ? 0.26 : 0.31, 0.045, 14, 1), M.white(), 0, 0.198, 0.01));
  grin.scale.setScalar(0.001);
  head.add(grin);

  buildHair(head, L);
  if (L.hat === "helmet") head.add(buildHelmet(L));
  else if (L.hat === "cap") head.add(buildCap(L));
  return head;
}

function buildArm(side: -1 | 1, L: Look) {
  const f = L.body === "f";
  const s = side < 0 ? "L" : "R";
  const skin = M.skin(L.skin);
  const arm = group(`arm${s}`, (f ? 0.31 : 0.37) * side, 0.47, 0);
  arm.rotation.z = 0.18 * side;
  const ur = f ? 0.08 : 0.105;
  arm.add(mesh(new THREE.CapsuleGeometry(ur, 0.2, 4, sg(14)), skin, 0, -0.15, 0));
  arm.add(mesh(new THREE.SphereGeometry(f ? 0.1 : 0.13, sg(16), sg(12)), L.outfit === "armor" ? skin : M.cloth(L.top!), 0, -0.02, 0));
  if (L.outfit === "tee") arm.add(mesh(new THREE.CylinderGeometry(ur + 0.028, ur + 0.022, 0.17, sg(14)), M.cloth(L.top!), 0, -0.09, 0));
  if (L.outfit === "hoodie") arm.add(mesh(new THREE.CylinderGeometry(ur + 0.03, ur + 0.025, 0.34, sg(14)), M.cloth(L.top!), 0, -0.15, 0));
  const fore = group(`fore${s}`, 0, -0.31, 0);
  fore.rotation.x = -0.3;
  const fr = f ? 0.07 : 0.09;
  fore.add(mesh(new THREE.CapsuleGeometry(fr, 0.16, 4, sg(14)), skin, 0, -0.12, 0));
  if (L.outfit === "armor") fore.add(mesh(new THREE.CylinderGeometry(fr + 0.018, fr + 0.01, 0.16, sg(18)), M.brown(), 0, -0.15, 0));
  if (L.outfit === "hoodie") fore.add(mesh(new THREE.CylinderGeometry(fr + 0.025, fr + 0.03, 0.24, sg(14)), M.cloth(L.top!), 0, -0.1, 0));
  const hand = group(`hand${s}`, 0, -0.3, 0);
  hand.add(mesh(new THREE.SphereGeometry(f ? 0.075 : 0.09, sg(16), sg(12)), skin));
  fore.add(hand);
  arm.add(fore);
  return { arm, hand };
}

function buildLeg(side: -1 | 1, L: Look) {
  const f = L.body === "f";
  const s = side < 0 ? "L" : "R";
  const skin = M.skin(L.skin);
  const leg = group(`leg${s}`, (f ? 0.11 : 0.13) * side, -0.02, 0);
  const r = f ? 0.085 : 0.1;
  leg.add(mesh(new THREE.CapsuleGeometry(r, 0.24, 4, sg(14)), skin, 0, -0.2, 0));
  const shin = group(`shin${s}`, 0, -0.42, 0);
  shin.add(mesh(new THREE.CapsuleGeometry(r - 0.012, 0.24, 4, sg(14)), skin, 0, -0.17, 0));
  const bs = L.bottomStyle;
  if (L.outfit !== "armor" && bs === "pants") {
    leg.add(mesh(new THREE.CylinderGeometry(r + 0.03, r + 0.02, 0.44, sg(14)), M.cloth(L.bottom!), 0, -0.2, 0));
    shin.add(mesh(new THREE.CylinderGeometry(r + 0.02, r + 0.025, 0.32, sg(14)), M.cloth(L.bottom!), 0, -0.17, 0));
  } else if (L.outfit !== "armor" && bs === "shorts") {
    leg.add(mesh(new THREE.CylinderGeometry(r + 0.035, r + 0.03, 0.22, sg(14)), M.cloth(L.bottom!), 0, -0.1, 0));
  }
  if (L.outfit === "armor") {
    // gold greaves and sandals
    shin.add(mesh(new THREE.CylinderGeometry(r, r - 0.01, 0.22, sg(16)), M.gold(), 0, -0.2, 0.01));
    shin.add(mesh(new THREE.BoxGeometry(0.15, 0.07, 0.25), M.brown(), 0, -0.4, 0.05));
  } else {
    // sneakers: white with a cardinal stripe
    shin.add(mesh(new THREE.BoxGeometry(0.16, 0.08, 0.27), M.white(), 0, -0.4, 0.05));
    shin.add(mesh(new THREE.BoxGeometry(0.165, 0.025, 0.2), M.cloth(C.red), 0, -0.385, 0.06));
  }
  leg.add(shin);
  return leg;
}

function buildProp(kind: Look["prop"], hand: THREE.Group, torso: THREE.Group, other: THREE.Group) {
  if (kind === "sword") {
    const sword = group("sword", 0, -0.02, 0.02);
    const blade = mesh(new THREE.ConeGeometry(0.06, 0.5, 4), M.steel(), 0, 0, 0.32);
    blade.rotation.x = Math.PI / 2;
    blade.scale.set(1, 1, 0.3);
    sword.add(blade);
    sword.add(mesh(new THREE.BoxGeometry(0.2, 0.04, 0.05), M.gold(), 0, 0, 0.06));
    const grip = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.12, 8), M.brown(), 0, 0, 0);
    grip.rotation.x = Math.PI / 2;
    sword.add(grip);
    sword.rotation.x = 0.5; // point forward and a little down
    hand.add(sword);
  } else if (kind === "backpack") {
    const bag = mesh(new THREE.BoxGeometry(0.42, 0.46, 0.2), M.cloth(C.gold), 0, 0.3, -0.33);
    torso.add(bag);
    torso.add(mesh(new THREE.BoxGeometry(0.3, 0.16, 0.06), M.cloth("#7a0016"), 0, 0.2, -0.45));
  } else if (kind === "boba") {
    const cup = group("boba", 0, -0.04, 0.08);
    cup.add(mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.22, sg(14)), mat("Boba", "#e9c9a0", { roughness: 0.3 }), 0, 0.06, 0));
    cup.add(mesh(new THREE.CylinderGeometry(0.078, 0.078, 0.02, sg(14)), M.white(), 0, 0.17, 0));
    cup.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6), M.cloth("#ff6fa8"), 0.02, 0.25, 0));
    hand.add(cup);
  } else if (kind === "book") {
    const book = mesh(new THREE.BoxGeometry(0.24, 0.3, 0.05), M.cloth(C.red), 0, 0, 0.08);
    book.rotation.x = -0.3;
    hand.add(book);
    const pages = mesh(new THREE.BoxGeometry(0.22, 0.28, 0.035), M.white(), 0.012, 0, 0.08);
    pages.rotation.x = -0.3;
    hand.add(pages);
  } else if (kind === "phone") {
    const phone = mesh(new THREE.BoxGeometry(0.11, 0.2, 0.02), M.ink(), 0, 0.02, 0.09);
    phone.rotation.x = -0.6;
    hand.add(phone);
  } else if (kind === "football") {
    const ball = mesh(new THREE.SphereGeometry(1, sg(14), sg(10)), mat("Ball", "#7a4421", { roughness: 0.7 }), 0, 0, 0.08);
    ball.scale.set(0.1, 0.1, 0.16);
    hand.add(ball);
  } else if (kind === "pompoms") {
    for (const [h, c] of [[hand, C.gold], [other, C.red]] as const) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        h.add(mesh(new THREE.SphereGeometry(0.075, sg(8), sg(6)), M.cloth(c), Math.cos(a) * 0.07, -0.03 + Math.sin(a * 1.7) * 0.04, Math.sin(a) * 0.07));
      }
      h.add(mesh(new THREE.SphereGeometry(0.09, sg(10), sg(8)), M.cloth(c), 0, -0.06, 0));
    }
  }
}

function buildBody(L: Look) {
  const f = L.body === "f";
  const root = group("Trojan");
  const hips = group("hips", 0, 0.86, 0);
  root.add(hips);
  const torso = group("torso", 0, 0.06, 0);
  hips.add(torso);
  const skin = M.skin(L.skin);

  if (L.outfit === "armor") {
    // skirt of red pteruges with gold edging, and a brown belt with a gold buckle
    const sr = f ? [0.25, 0.36, 0.38] : [0.27, 0.34, 0.32];
    hips.add(mesh(new THREE.CylinderGeometry(sr[0], sr[1], sr[2], sg(24), 1, true), M.cloth(C.red), 0, -0.04 - sr[2] / 4, 0));
    const strips = DETAIL < 1 ? 10 : 16;
    for (let i = 0; i < strips; i++) {
      const a = (i / strips) * Math.PI * 2;
      const strip = mesh(new THREE.BoxGeometry(0.035, sr[2] - 0.02, 0.012), M.gold(), Math.sin(a) * (sr[1] - 0.03), -0.05 - sr[2] / 4, Math.cos(a) * (sr[1] - 0.03));
      strip.rotation.y = a;
      strip.rotation.x = 0.2;
      hips.add(strip);
    }
    hips.add(mesh(new THREE.CylinderGeometry(f ? 0.25 : 0.29, f ? 0.25 : 0.29, 0.08, sg(28)), M.brown(), 0, 0.04, 0));
    const buckle = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, sg(20)), M.gold(), 0, 0.04, f ? 0.25 : 0.29);
    buckle.rotation.x = Math.PI / 2;
    hips.add(buckle);
    // gold cuirass (muscled for the guys, smooth and fitted for the girls)
    const chest = mesh(new THREE.CylinderGeometry(f ? 0.28 : 0.33, f ? 0.22 : 0.27, 0.5, sg(28)), M.gold(), 0, 0.27, 0);
    chest.scale.z = 0.78;
    torso.add(chest);
    for (const side of [-1, 1]) {
      if (!f) {
        const pec = mesh(new THREE.SphereGeometry(0.15, sg(18), sg(12)), M.gold(), 0.12 * side, 0.38, 0.17);
        pec.scale.set(1, 0.75, 0.55);
        torso.add(pec);
        const ab = mesh(new THREE.SphereGeometry(0.1, sg(14), sg(10)), M.gold(), 0.08 * side, 0.15, 0.17);
        ab.scale.set(1, 0.75, 0.45);
        torso.add(ab);
      }
      torso.add(mesh(new THREE.SphereGeometry(0.035, sg(10), sg(8)), M.goldDark(), (f ? 0.17 : 0.2) * side, 0.5, f ? 0.13 : 0.15));
      torso.add(mesh(new THREE.BoxGeometry(0.12, 0.04, f ? 0.36 : 0.42), M.cloth(C.red), (f ? 0.19 : 0.22) * side, 0.54, 0));
    }
  } else {
    const top = M.cloth(L.top!);
    const w = f ? 0.27 : 0.31;
    const chest = mesh(new THREE.CylinderGeometry(w, w - 0.05, 0.52, sg(24)), top, 0, 0.26, 0);
    chest.scale.z = 0.8;
    torso.add(chest);
    const shoulders = mesh(new THREE.SphereGeometry(1, sg(20), sg(10), 0, Math.PI * 2, 0, Math.PI / 2), top, 0, 0.5, 0);
    shoulders.scale.set(w, 0.1, w * 0.8);
    torso.add(shoulders);
    if (L.outfit === "hoodie") {
      const hood = mesh(new THREE.TorusGeometry(0.16, 0.07, sg(8), sg(18), Math.PI * 1.3), top, 0, 0.56, -0.08);
      hood.rotation.set(Math.PI / 2, 0, Math.PI * 0.85);
      torso.add(hood);
      torso.add(mesh(new THREE.BoxGeometry(0.3, 0.13, 0.04), M.cloth(shade(L.top!)), 0, 0.12, w * 0.8 - 0.01));
    } else {
      // tee: a gold chest stripe so it reads as a team shirt
      const stripe = mesh(new THREE.CylinderGeometry(w + 0.004, w - 0.012, 0.07, sg(24), 1, true), M.cloth(L.top === C.gold ? C.red : C.gold), 0, 0.34, 0);
      stripe.scale.z = 0.8;
      torso.add(stripe);
    }
    // waist: shorts / pants top, or a pleated skirt
    const bottom = M.cloth(L.bottom!);
    if (L.bottomStyle === "skirt") {
      hips.add(mesh(new THREE.CylinderGeometry(0.24, 0.36, 0.3, sg(20), 1, true), bottom, 0, -0.1, 0));
    } else {
      hips.add(mesh(new THREE.CylinderGeometry(f ? 0.25 : 0.27, f ? 0.27 : 0.28, 0.18, sg(20)), bottom, 0, -0.04, 0));
    }
  }
  torso.add(mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.12, sg(16)), skin, 0, 0.58, 0));

  // cape hangs from the shoulders, pivoting at the top (the node always exists so clips can drive it)
  const cape = group("cape", 0, 0.54, -0.2);
  cape.rotation.x = 0.15;
  if (L.cape) {
    const capeGeo = new THREE.PlaneGeometry(f ? 0.54 : 0.62, 0.95, 4, 6);
    capeGeo.translate(0, -0.475, 0);
    const cp = capeGeo.attributes.position;
    for (let i = 0; i < cp.count; i++) cp.setZ(i, -0.25 * (cp.getX(i) / 0.31) ** 2 * 0.3);
    capeGeo.computeVertexNormals();
    cape.add(mesh(capeGeo, M.cloth(L.cape)));
  }
  torso.add(cape);

  torso.add(buildHead(L));
  const AL = buildArm(-1, L);
  const AR = buildArm(1, L);
  buildProp(L.prop, AL.hand, torso, AR.hand);
  torso.add(AL.arm, AR.arm);
  hips.add(buildLeg(-1, L), buildLeg(1, L));
  return root;
}

function shade(hex: string) {
  return "#" + new THREE.Color(hex).multiplyScalar(0.8).getHexString();
}

// ---- animation helpers ----
type E3 = [number, number, number];
const q = new THREE.Quaternion();
const e = new THREE.Euler();
function rot(node: string, times: number[], eulers: E3[]) {
  const values: number[] = [];
  for (const [x, y, z] of eulers) {
    q.setFromEuler(e.set(x, y, z));
    values.push(q.x, q.y, q.z, q.w);
  }
  return new THREE.QuaternionKeyframeTrack(`${node}.quaternion`, times, values);
}
function pos(node: string, times: number[], ps: E3[]) {
  return new THREE.VectorKeyframeTrack(`${node}.position`, times, ps.flat());
}
function scl(node: string, times: number[], ss: (number | E3)[]) {
  return new THREE.VectorKeyframeTrack(`${node}.scale`, times, ss.flatMap((s) => (typeof s === "number" ? [s, s, s] : s)));
}
const OFF = 0.001;
const HIP_Y = 0.86;
const ARM_Z = 0.18;

function walkClip(name: string) {
  const T = 0.62;
  const t = [0, 0.25, 0.5, 0.75, 1].map((k) => k * T);
  const swing = [-0.55, 0, 0.55, 0, -0.55];
  const swingR = swing.map((v) => -v);
  const knee = [0.08, 0.1, 0.35, 0.95, 0.08];
  const kneeR = [0.35, 0.95, 0.08, 0.1, 0.35];
  return new THREE.AnimationClip(name, T, [
    rot("legL", t, swing.map((x) => [x, 0, 0] as E3)),
    rot("legR", t, swingR.map((x) => [x, 0, 0] as E3)),
    rot("shinL", t, knee.map((x) => [x, 0, 0] as E3)),
    rot("shinR", t, kneeR.map((x) => [x, 0, 0] as E3)),
    rot("armL", t, swingR.map((x) => [x * 0.8, 0, -ARM_Z] as E3)),
    rot("armR", t, swing.map((x) => [x * 0.8, 0, ARM_Z] as E3)),
    rot("foreL", t, t.map(() => [-0.45, 0, 0] as E3)),
    rot("foreR", t, t.map(() => [-0.45, 0, 0] as E3)),
    pos("hips", t, [HIP_Y, HIP_Y + 0.045, HIP_Y, HIP_Y + 0.045, HIP_Y].map((y) => [0, y, 0] as E3)),
    rot("hips", t, [0.09, 0, -0.09, 0, 0.09].map((y) => [0, y, 0] as E3)),
    rot("torso", t, [-0.12, 0, 0.12, 0, -0.12].map((y) => [0.07, y, 0] as E3)),
    rot("head", t, [0.04, 0, -0.04, 0, 0.04].map((y) => [-0.04, y, 0] as E3)),
    rot("cape", t, [0.3, 0.42, 0.3, 0.42, 0.3].map((x) => [x, 0, 0] as E3)),
    scl("smile", [0], [1]),
    scl("grin", [0], [OFF]),
    scl("eyeL", [0], [1]),
    scl("eyeR", [0], [1]),
  ]);
}

function idleClip(name: string, happy: boolean) {
  const T = 2.4;
  const t = [0, T / 2, T];
  const breath = [0, 1, 0];
  return new THREE.AnimationClip(name, T, [
    rot("legL", t, t.map(() => [0, 0, -0.03] as E3)),
    rot("legR", t, t.map(() => [0, 0, 0.03] as E3)),
    rot("shinL", t, t.map(() => [0, 0, 0] as E3)),
    rot("shinR", t, t.map(() => [0, 0, 0] as E3)),
    rot("armL", t, breath.map((b) => [0, 0, -ARM_Z - 0.04 * b] as E3)),
    rot("armR", t, breath.map((b) => [0, 0, ARM_Z + 0.04 * b] as E3)),
    rot("foreL", t, t.map(() => [-0.35, 0, 0] as E3)),
    rot("foreR", t, t.map(() => [-0.25, 0, 0] as E3)),
    pos("hips", t, breath.map((b) => [0, HIP_Y - 0.008 * b, 0] as E3)),
    rot("hips", t, t.map(() => [0, 0, 0] as E3)),
    rot("torso", t, breath.map((b) => [-0.02 * b, 0, 0] as E3)),
    rot("head", t, breath.map((b) => [happy ? -0.08 : -0.02, 0, (happy ? 0.07 : 0.03) * (b - 0.5)] as E3)),
    rot("cape", t, breath.map((b) => [0.12 + 0.04 * b, 0, 0] as E3)),
    scl("smile", [0], [happy ? OFF : 1]),
    scl("grin", [0], [happy ? 1 : OFF]),
    scl("eyeL", [0], [happy ? [1, 0.8, 1] : 1]),
    scl("eyeR", [0], [happy ? [1, 0.8, 1] : 1]),
  ]);
}

function waveClip() {
  const T = 3;
  // body: a little hop of joy, then settle
  const tb = [0, 0.18, 0.36, 0.55, T];
  // right arm up, forearm waving side to side
  const ta = [0, 0.35, 0.6, 0.85, 1.1, 1.35, 1.6, 1.85, 2.1, 2.35, 2.75, T];
  const fore: E3[] = [[-0.3, 0, 0], [0, 0, 0.1], [0, 0, -0.55], [0, 0, 0.35], [0, 0, -0.55], [0, 0, 0.35], [0, 0, -0.55], [0, 0, 0.35], [0, 0, -0.55], [0, 0, 0.2], [-0.25, 0, 0], [-0.25, 0, 0]];
  const armR: E3[] = ta.map((k) => (k === 0 || k >= 2.75 ? [0, 0, ARM_Z] : [0, -0.25, 2.55]));
  const tf = [0, 0.25, T];
  return new THREE.AnimationClip("Wave", T, [
    pos("hips", tb, [[0, HIP_Y, 0], [0, HIP_Y - 0.06, 0], [0, HIP_Y + 0.14, 0], [0, HIP_Y, 0], [0, HIP_Y, 0]]),
    rot("legL", tb, [[0, 0, -0.03], [-0.2, 0, -0.03], [0.05, 0, -0.08], [0, 0, -0.03], [0, 0, -0.03]]),
    rot("legR", tb, [[0, 0, 0.03], [-0.2, 0, 0.03], [0.05, 0, 0.08], [0, 0, 0.03], [0, 0, 0.03]]),
    rot("shinL", tb, [[0, 0, 0], [0.4, 0, 0], [0.15, 0, 0], [0, 0, 0], [0, 0, 0]]),
    rot("shinR", tb, [[0, 0, 0], [0.4, 0, 0], [0.15, 0, 0], [0, 0, 0], [0, 0, 0]]),
    rot("hips", tb, tb.map(() => [0, 0, 0] as E3)),
    rot("armR", ta, armR),
    rot("foreR", ta, fore),
    rot("armL", tf, [[0, 0, -ARM_Z], [-0.3, 0, -0.35], [-0.3, 0, -0.35]]),
    rot("foreL", tf, [[-0.35, 0, 0], [-0.6, 0, 0], [-0.6, 0, 0]]),
    rot("torso", tf, [[0, 0, 0], [-0.06, 0, -0.06], [-0.06, 0, -0.06]]),
    rot("head", [0, 0.3, 1.5, T], [[0, 0, 0], [-0.1, 0, 0.12], [-0.1, 0, -0.05], [-0.08, 0, 0.06]]),
    rot("cape", tb, [[0.12, 0, 0], [0.1, 0, 0], [0.45, 0, 0], [0.15, 0, 0], [0.14, 0, 0]]),
    scl("smile", tf, [1, OFF, OFF]),
    scl("grin", [0, 0.12, 0.3, T], [OFF, 1.12, 1, 1]),
    scl("eyeL", tf, [1, [1, 0.8, 1], [1, 0.8, 1]]),
    scl("eyeR", tf, [1, [1, 0.8, 1], [1, 0.8, 1]]),
  ]);
}

/** Both arms pumping overhead with little hops (loop). */
function cheerClip() {
  const T = 0.8;
  const t = [0, 0.2, 0.4, 0.6, 0.8];
  const hop = [0, 0.12, 0, 0.12, 0];
  return new THREE.AnimationClip("Cheer", T, [
    pos("hips", t, hop.map((h) => [0, HIP_Y + h, 0] as E3)),
    rot("hips", t, t.map(() => [0, 0, 0] as E3)),
    rot("legL", t, hop.map((h) => [-h * 1.2, 0, -0.06] as E3)),
    rot("legR", t, hop.map((h) => [-h * 1.2, 0, 0.06] as E3)),
    rot("shinL", t, hop.map((h) => [0.05 + h * 2.5, 0, 0] as E3)),
    rot("shinR", t, hop.map((h) => [0.05 + h * 2.5, 0, 0] as E3)),
    rot("armL", t, [[0, 0, -2.5], [0, 0, -2.9], [0, 0, -2.5], [0, 0, -2.9], [0, 0, -2.5]]),
    rot("armR", t, [[0, 0, 2.9], [0, 0, 2.5], [0, 0, 2.9], [0, 0, 2.5], [0, 0, 2.9]]),
    rot("foreL", t, t.map(() => [0, 0, -0.2] as E3)),
    rot("foreR", t, t.map(() => [0, 0, 0.2] as E3)),
    rot("torso", t, t.map(() => [-0.05, 0, 0] as E3)),
    rot("head", t, hop.map((h) => [-0.12 - h * 0.4, 0, 0] as E3)),
    rot("cape", t, hop.map((h) => [0.2 + h * 2, 0, 0] as E3)),
    scl("smile", [0], [OFF]),
    scl("grin", [0], [1]),
    scl("eyeL", [0], [[1, 0.75, 1]]),
    scl("eyeR", [0], [[1, 0.75, 1]]),
  ]);
}

/** Side-to-side groove with bent arms and a head bob (loop). */
function danceClip() {
  const T = 1.0;
  const t = [0, 0.25, 0.5, 0.75, 1];
  const sway = [1, 0, -1, 0, 1];
  const bob = [0, 1, 0, 1, 0];
  return new THREE.AnimationClip("Dance", T, [
    pos("hips", t, sway.map((s, i) => [s * 0.05, HIP_Y - bob[i] * 0.05, 0] as E3)),
    rot("hips", t, sway.map((s) => [0, s * 0.25, s * 0.08] as E3)),
    rot("legL", t, sway.map((s) => [0, 0, -0.1 - s * 0.08] as E3)),
    rot("legR", t, sway.map((s) => [0, 0, 0.1 - s * 0.08] as E3)),
    rot("shinL", t, bob.map((b) => [0.1 + b * 0.25, 0, 0] as E3)),
    rot("shinR", t, bob.map((b) => [0.1 + b * 0.25, 0, 0] as E3)),
    rot("armL", t, sway.map((s) => [-0.6 + s * 0.4, 0, -0.5] as E3)),
    rot("armR", t, sway.map((s) => [-0.6 - s * 0.4, 0, 0.5] as E3)),
    rot("foreL", t, t.map(() => [-1.4, 0, 0] as E3)),
    rot("foreR", t, t.map(() => [-1.4, 0, 0] as E3)),
    rot("torso", t, sway.map((s) => [0, -s * 0.2, -s * 0.06] as E3)),
    rot("head", t, bob.map((b, i) => [-0.05 + b * 0.1, 0, sway[i] * 0.1] as E3)),
    rot("cape", t, sway.map((s) => [0.25, 0, s * 0.15] as E3)),
    scl("smile", [0], [OFF]),
    scl("grin", [0], [1]),
    scl("eyeL", [0], [[1, 0.8, 1]]),
    scl("eyeR", [0], [[1, 0.8, 1]]),
  ]);
}

/** Looking down at the phone / book in the left hand (loop). */
function readClip() {
  const T = 3;
  const t = [0, 1.5, 3];
  const n = [0, 1, 0];
  return new THREE.AnimationClip("Read", T, [
    pos("hips", t, t.map(() => [0, HIP_Y, 0] as E3)),
    rot("hips", t, t.map(() => [0, 0, 0] as E3)),
    rot("legL", t, t.map(() => [0, 0, -0.03] as E3)),
    rot("legR", t, t.map(() => [0, 0, 0.03] as E3)),
    rot("shinL", t, t.map(() => [0, 0, 0] as E3)),
    rot("shinR", t, t.map(() => [0, 0, 0] as E3)),
    rot("armL", t, t.map(() => [-0.5, 0.3, -0.1] as E3)),
    rot("foreL", t, t.map(() => [-1.3, 0, 0.3] as E3)),
    rot("armR", t, t.map(() => [0, 0, ARM_Z] as E3)),
    rot("foreR", t, t.map(() => [-0.3, 0, 0] as E3)),
    rot("torso", t, t.map(() => [0.05, 0, 0] as E3)),
    rot("head", t, n.map((k) => [0.35, 0, 0.05 * k] as E3)),
    rot("cape", t, t.map(() => [0.12, 0, 0] as E3)),
    scl("smile", [0], [1]),
    scl("grin", [0], [OFF]),
    scl("eyeL", [0], [[1, 0.7, 1]]),
    scl("eyeR", [0], [[1, 0.7, 1]]),
  ]);
}

function makeScene(look: Look = MASCOT) {
  const scene = new THREE.Group();
  scene.name = "TrojanScene";
  const body = buildBody(look);
  body.scale.setScalar(0.85); // ~2 units tall with the plume
  scene.add(body);
  scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.frustumCulled = false;
  });
  return scene;
}
const clips = () => [idleClip("Idle", false), walkClip("Walk"), walkClip("Walking"), waveClip(), idleClip("Happy", true)];

let cached: CharacterAsset | null = null;
/** Shared: the tours show one walker at a time. */
export function buildTrojan(): CharacterAsset {
  if (!cached) cached = { scene: makeScene(), animations: clips() };
  return cached;
}

/** Your own Trojan: the mascot with your plume and cape colours (Settings > Your Trojan). Not shared with the tour guide. */
export function buildMyTrojan(colors: { plume: string; cape: string }): CharacterAsset {
  return { scene: makeScene({ ...MASCOT, plume: colors.plume, cape: colors.cape }), animations: clips() };
}

let glbUrl: Promise<string> | null = null;
/** The same character as a .glb blob URL, for deck.gl's ScenegraphLayer (photoreal 3D tour). */
export function trojanGlbUrl(): Promise<string> {
  if (!glbUrl) {
    glbUrl = (async () => {
      const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
      // a fresh copy in rest pose, separate from the live three.js scene (Mapbox tour)
      const buf = (await new GLTFExporter().parseAsync(makeScene(), { binary: true, animations: clips().filter((c) => c.name !== "Walking") })) as ArrayBuffer;
      return URL.createObjectURL(new Blob([buf], { type: "model/gltf-binary" }));
    })();
    glbUrl.catch(() => (glbUrl = null));
  }
  return glbUrl;
}

// ---------- crowd cast ----------
const SKIN = ["#ffd9b8", "#f1c39a", "#d9a179", "#b97a52", "#8d5a3b", "#6b4029"];
const HAIR = { black: "#1f1712", brown: "#5b3a24", blonde: "#e6c271", auburn: "#8a3b1e", dark: "#2e2018" };

/** The cast for crowds: Trojan guys and girls in armor, plus students in team gear. */
export const CROWD_LOOKS: Look[] = [
  { body: "m", skin: SKIN[1], hat: "helmet", plume: "#b0102a", outfit: "armor", cape: C.red, prop: "sword", brows: "bold", blush: true },
  { body: "f", skin: SKIN[0], hat: "helmet", plume: "#f2b705", outfit: "armor", cape: C.red, prop: "none", hair: { style: "ponytail", color: HAIR.blonde }, blush: true },
  { body: "f", skin: SKIN[4], hat: "helmet", plume: "#b0102a", outfit: "armor", cape: "#7a0016", prop: "sword", hair: { style: "ponytail", color: HAIR.black }, blush: true },
  { body: "m", skin: SKIN[3], hat: "cap", capColor: C.red, outfit: "tee", top: C.gold, bottom: "#c9b48a", bottomStyle: "shorts", prop: "backpack", hair: { style: "short", color: HAIR.black }, blush: true },
  { body: "f", skin: SKIN[2], hat: "none", outfit: "tee", top: C.red, bottom: C.gold, bottomStyle: "skirt", prop: "pompoms", hair: { style: "ponytail", color: HAIR.brown }, blush: true },
  { body: "m", skin: SKIN[5], hat: "none", outfit: "hoodie", top: C.red, bottom: "#3b4a6b", bottomStyle: "pants", prop: "phone", hair: { style: "curly", color: HAIR.black }, blush: true },
  { body: "f", skin: SKIN[1], hat: "none", outfit: "hoodie", top: "#f2b705", bottom: "#2d3a55", bottomStyle: "pants", prop: "boba", hair: { style: "bun", color: HAIR.auburn }, blush: true },
  { body: "m", skin: SKIN[0], hat: "none", outfit: "tee", top: C.red, bottom: "#3b4a6b", bottomStyle: "pants", prop: "football", hair: { style: "short", color: HAIR.brown }, blush: true },
  { body: "f", skin: SKIN[3], hat: "cap", capColor: C.gold, outfit: "tee", top: "#ffffff", bottom: C.red, bottomStyle: "shorts", prop: "book", hair: { style: "long", color: HAIR.dark }, blush: true },
  { body: "m", skin: SKIN[2], hat: "helmet", plume: "#f2b705", outfit: "tee", top: C.red, bottom: "#c9b48a", bottomStyle: "shorts", prop: "pompoms", hair: { style: "short", color: HAIR.black }, blush: true },
];

/** Node names the clips animate; everything else under them is baked into one mesh per node. */
const ANIM_NODES = new Set(["hips", "torso", "head", "armL", "foreL", "armR", "foreR", "legL", "shinL", "legR", "shinR", "cape", "smile", "grin", "eyeL", "eyeR"]);
let crowdMat: THREE.MeshStandardMaterial | null = null;

/**
 * A crowd-ready copy of a look: low-poly, and every rigid part merged into a single vertex-coloured mesh,
 * so one character is ~16 draw calls instead of ~150. Clone the returned group per crowd member (geometry is shared).
 */
export async function bakeCrowdLook(look: Look): Promise<THREE.Group> {
  const { mergeGeometries } = await import("three/examples/jsm/utils/BufferGeometryUtils.js");
  crowdMat ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.08, side: THREE.DoubleSide });
  DETAIL = 0.5;
  let scene: THREE.Group;
  try {
    scene = makeScene(look);
  } finally {
    DETAIL = 1;
  }
  scene.updateMatrixWorld(true);
  const nodes: THREE.Object3D[] = [];
  scene.traverse((o) => ANIM_NODES.has(o.name) && !(o as THREE.Mesh).isMesh && nodes.push(o));
  const inv = new THREE.Matrix4();
  const rel = new THREE.Matrix4();
  for (const node of nodes) {
    const parts: THREE.BufferGeometry[] = [];
    const meshes: THREE.Mesh[] = [];
    const visit = (o: THREE.Object3D) => {
      for (const c of o.children) {
        if (ANIM_NODES.has(c.name)) continue;
        if ((c as THREE.Mesh).isMesh) meshes.push(c as THREE.Mesh);
        visit(c);
      }
    };
    visit(node);
    if (!meshes.length) continue;
    inv.copy(node.matrixWorld).invert();
    for (const m of meshes) {
      const g = m.geometry.clone();
      if (!g.index) continue; // all our primitives are indexed
      g.deleteAttribute("uv");
      rel.multiplyMatrices(inv, m.matrixWorld);
      g.applyMatrix4(rel);
      const col = (m.material as THREE.MeshStandardMaterial).color;
      const n = g.attributes.position.count;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) arr.set([col.r, col.g, col.b], i * 3);
      g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
      parts.push(g);
      m.parent?.remove(m);
    }
    const merged = mergeGeometries(parts, false);
    if (!merged) continue;
    const baked = new THREE.Mesh(merged, crowdMat);
    baked.frustumCulled = false;
    node.add(baked);
  }
  // the smile mesh is itself animated; give it the shared material too
  scene.traverse((o) => {
    if (o.name === "smile" && (o as THREE.Mesh).isMesh) {
      const m = o as THREE.Mesh;
      const g = m.geometry;
      const n = g.attributes.position.count;
      const c = new THREE.Color(C.mouth);
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
      g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
      m.material = crowdMat!;
    }
  });
  // drop now-empty helper groups
  const empties: THREE.Object3D[] = [];
  scene.traverse((o) => o !== scene && !ANIM_NODES.has(o.name) && !(o as THREE.Mesh).isMesh && o.children.length === 0 && empties.push(o));
  empties.forEach((o) => o.parent?.remove(o));
  return scene;
}

let crowdClipsCache: THREE.AnimationClip[] | null = null;
/** Every clip a crowd member can play: Idle, Walk, Wave, Happy, Cheer, Dance, Read. */
export function crowdClips() {
  crowdClipsCache ??= [idleClip("Idle", false), walkClip("Walk"), waveClip(), idleClip("Happy", true), cheerClip(), danceClip(), readClip()];
  return crowdClipsCache;
}
