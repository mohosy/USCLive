"use client";

/**
 * Procedural Trojan mascot for the walking tours: gold crested helmet, big grin, gold armor, red cape, short sword.
 * Built from three.js primitives (no external asset) with hand-keyed clips:
 *   "Idle"  – breathing, small smile
 *   "Walk"  – stride cycle (also exported as "Walking")
 *   "Wave"  – hop, right arm up and waving, big toothy grin (play once)
 *   "Happy" – idle with the big grin, after the wave
 * Faces +Z, y-up, feet at y = 0, ~2 units tall.
 */
import * as THREE from "three";

export interface CharacterAsset {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

const C = {
  skin: "#ffd2a6",
  gold: "#d9a531",
  goldDark: "#8a5f14",
  red: "#a3001b",
  plume: "#b0102a",
  brown: "#5a3a22",
  white: "#ffffff",
  ink: "#1d1410",
  mouth: "#4a0f12",
  steel: "#c9ced6",
};

const mats = {
  skin: new THREE.MeshStandardMaterial({ name: "Skin", color: C.skin, roughness: 0.6, emissive: "#3a2010", emissiveIntensity: 0.35 }),
  gold: new THREE.MeshStandardMaterial({ name: "Gold", color: C.gold, roughness: 0.45, metalness: 0.3, envMapIntensity: 0.45 }),
  goldDark: new THREE.MeshStandardMaterial({ name: "GoldDark", color: C.goldDark, roughness: 0.55, metalness: 0.25, envMapIntensity: 0.4 }),
  red: new THREE.MeshStandardMaterial({ name: "Red", color: C.red, roughness: 0.7, side: THREE.DoubleSide }),
  plume: new THREE.MeshStandardMaterial({ name: "Plume", color: C.plume, roughness: 0.8 }),
  brown: new THREE.MeshStandardMaterial({ name: "Brown", color: C.brown, roughness: 0.75 }),
  white: new THREE.MeshStandardMaterial({ name: "White", color: C.white, roughness: 0.3 }),
  ink: new THREE.MeshStandardMaterial({ name: "Ink", color: C.ink, roughness: 0.4 }),
  mouth: new THREE.MeshStandardMaterial({ name: "Mouth", color: C.mouth, roughness: 0.6 }),
  steel: new THREE.MeshStandardMaterial({ name: "Steel", color: C.steel, roughness: 0.2, metalness: 0.9 }),
};

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

function buildHead() {
  const head = group("head", 0, 0.6, 0.02);
  head.scale.setScalar(1.3); // mascot proportions: big head
  const skull = mesh(new THREE.SphereGeometry(1, 32, 24), mats.skin, 0, HEAD_C, 0);
  skull.scale.set(HR.x, HR.y, HR.z);
  head.add(skull);
  // jaw, so the chin reads square and heroic
  const jaw = mesh(new THREE.SphereGeometry(1, 24, 16), mats.skin, 0, 0.14, 0.03);
  jaw.scale.set(0.24, 0.16, 0.24);
  head.add(jaw);

  // eyes: big whites with pupils, in their own groups so they can squint
  for (const side of [-1, 1]) {
    const ex = 0.1 * side;
    const ey = 0.34;
    const eye = group(side < 0 ? "eyeL" : "eyeR", ex, ey, faceZ(ex, ey) - 0.02);
    const white = mesh(new THREE.SphereGeometry(1, 20, 14), mats.white);
    white.scale.set(0.072, 0.085, 0.04);
    eye.add(white);
    const pupil = mesh(new THREE.SphereGeometry(0.034, 14, 10), mats.ink, -0.012 * side, -0.005, 0.034);
    eye.add(pupil);
    head.add(eye);
    // determined brows: inner ends lower
    const brow = onFace(new THREE.BoxGeometry(0.13, 0.032, 0.03), mats.ink, 0.105 * side, 0.45, 0.005, side < 0 ? "browL" : "browR");
    brow.rotation.z = -0.32 * side;
    head.add(brow);
  }
  // nose
  const nose = mesh(new THREE.SphereGeometry(0.05, 14, 10), mats.skin, 0, 0.27, faceZ(0, 0.27) + 0.01);
  nose.scale.set(0.9, 1.2, 1);
  head.add(nose);

  // small confident smile (walk / idle)
  const smileGeo = new THREE.TorusGeometry(0.085, 0.013, 6, 18, Math.PI);
  smileGeo.rotateZ(Math.PI);
  head.add(onFace(smileGeo, mats.mouth, 0, 0.19, 0.008, "smile"));
  // big toothy grin (arrival)
  const grin = group("grin");
  const grinMouth = new THREE.CircleGeometry(0.13, 28, Math.PI, Math.PI);
  grinMouth.scale(1.3, 0.8, 1);
  grin.add(onFace(grinMouth, mats.mouth, 0, 0.22, 0.006));
  const teeth = new THREE.PlaneGeometry(0.31, 0.045, 14, 1);
  grin.add(onFace(teeth, mats.white, 0, 0.198, 0.01));
  grin.scale.setScalar(0.001);
  head.add(grin);

  // helmet: gold band with dark slats, domed cap, cheek guards, crest + plume
  const helmet = group("helmet", 0, 0, 0);
  const band = mesh(new THREE.CylinderGeometry(0.3, 0.31, 0.2, 40, 1, true), mats.gold, 0, 0.52, 0);
  band.scale.z = 1.04;
  helmet.add(band);
  const bandIn = mesh(new THREE.CylinderGeometry(0.295, 0.305, 0.2, 40, 1, true), mats.goldDark, 0, 0.52, 0);
  (bandIn.material as THREE.Material).side = THREE.DoubleSide;
  helmet.add(bandIn);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const slat = mesh(new THREE.BoxGeometry(0.04, 0.13, 0.02), mats.goldDark, Math.sin(a) * 0.315, 0.52, Math.cos(a) * 0.325);
    slat.rotation.y = a;
    helmet.add(slat);
  }
  const rimTop = mesh(new THREE.TorusGeometry(0.31, 0.02, 8, 40), mats.gold, 0, 0.62, 0);
  rimTop.rotation.x = Math.PI / 2;
  helmet.add(rimTop);
  const rimBot = mesh(new THREE.TorusGeometry(0.31, 0.022, 8, 40), mats.gold, 0, 0.42, 0);
  rimBot.rotation.x = Math.PI / 2;
  helmet.add(rimBot);
  const cap = mesh(new THREE.SphereGeometry(0.31, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), mats.gold, 0, 0.62, 0);
  cap.scale.y = 0.42;
  helmet.add(cap);
  for (const side of [-1, 1]) {
    const guard = mesh(new THREE.BoxGeometry(0.06, 0.2, 0.15), mats.gold, 0.29 * side, 0.3, 0.02);
    guard.rotation.z = 0.08 * side;
    helmet.add(guard);
    const stud = mesh(new THREE.SphereGeometry(0.04, 12, 8), mats.gold, 0.3 * side, 0.42, 0.02);
    helmet.add(stud);
  }
  const crestBase = mesh(new THREE.BoxGeometry(0.08, 0.06, 0.34), mats.gold, 0, 0.77, 0);
  helmet.add(crestBase);
  // plume: a tall brush of red feathers fanned front to back (thin side to side)
  for (let i = 0; i < 14; i++) {
    const t = (i % 7) / 6;
    const side = i < 7 ? -1 : 1;
    const h = 0.44 - Math.abs(t - 0.45) * 0.22;
    const f = mesh(new THREE.ConeGeometry(0.075, h, 10), mats.plume, 0.035 * side, 0.8 + h / 2, -0.15 + t * 0.3);
    f.scale.x = 0.6;
    f.rotation.set(-0.6 + t * 1.05, 0, -0.22 * side);
    helmet.add(f);
  }
  head.add(helmet);
  return head;
}

function buildArm(side: -1 | 1) {
  const s = side < 0 ? "L" : "R";
  const arm = group(`arm${s}`, 0.37 * side, 0.47, 0);
  arm.rotation.z = 0.18 * side;
  const upper = mesh(new THREE.CapsuleGeometry(0.105, 0.2, 6, 14), mats.skin, 0, -0.15, 0);
  arm.add(upper);
  const shoulder = mesh(new THREE.SphereGeometry(0.13, 16, 12), mats.skin, 0, -0.02, 0);
  arm.add(shoulder);
  const fore = group(`fore${s}`, 0, -0.31, 0);
  fore.rotation.x = -0.3;
  fore.add(mesh(new THREE.CapsuleGeometry(0.09, 0.16, 6, 14), mats.skin, 0, -0.12, 0));
  fore.add(mesh(new THREE.CylinderGeometry(0.108, 0.1, 0.16, 18), mats.brown, 0, -0.15, 0));
  const hand = group(`hand${s}`, 0, -0.3, 0);
  hand.add(mesh(new THREE.SphereGeometry(0.09, 16, 12), mats.skin));
  fore.add(hand);
  arm.add(fore);
  return { arm, hand };
}

function buildLeg(side: -1 | 1) {
  const s = side < 0 ? "L" : "R";
  const leg = group(`leg${s}`, 0.13 * side, -0.02, 0);
  leg.add(mesh(new THREE.CapsuleGeometry(0.1, 0.24, 6, 14), mats.skin, 0, -0.2, 0));
  const shin = group(`shin${s}`, 0, -0.42, 0);
  shin.add(mesh(new THREE.CapsuleGeometry(0.085, 0.24, 6, 14), mats.skin, 0, -0.17, 0));
  shin.add(mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.22, 16), mats.gold, 0, -0.2, 0.01));
  const foot = mesh(new THREE.BoxGeometry(0.15, 0.07, 0.25), mats.brown, 0, -0.4, 0.05);
  shin.add(foot);
  leg.add(shin);
  return leg;
}

function buildSword() {
  const sword = group("sword", 0, -0.02, 0.02);
  const blade = mesh(new THREE.ConeGeometry(0.06, 0.5, 4), mats.steel, 0, 0, 0.32);
  blade.rotation.x = Math.PI / 2;
  blade.scale.set(1, 1, 0.3);
  sword.add(blade);
  sword.add(mesh(new THREE.BoxGeometry(0.2, 0.04, 0.05), mats.gold, 0, 0, 0.06));
  const grip = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.12, 8), mats.brown, 0, 0, 0);
  grip.rotation.x = Math.PI / 2;
  sword.add(grip);
  sword.rotation.x = 0.5; // point forward and a little down
  return sword;
}

function buildBody() {
  const root = group("Trojan");
  const hips = group("hips", 0, 0.86, 0);
  root.add(hips);

  // skirt of red pteruges with gold edging, and a brown belt with a gold buckle
  hips.add(mesh(new THREE.CylinderGeometry(0.27, 0.34, 0.32, 24, 1, true), mats.red, 0, -0.12, 0));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const strip = mesh(new THREE.BoxGeometry(0.035, 0.3, 0.012), mats.gold, Math.sin(a) * 0.31, -0.13, Math.cos(a) * 0.31);
    strip.rotation.y = a;
    strip.rotation.x = 0.2 * Math.cos(0);
    hips.add(strip);
  }
  hips.add(mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.08, 28), mats.brown, 0, 0.04, 0));
  const buckle = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 20), mats.gold, 0, 0.04, 0.29);
  buckle.rotation.x = Math.PI / 2;
  hips.add(buckle);

  const torso = group("torso", 0, 0.06, 0);
  hips.add(torso);
  // gold muscle cuirass
  const chest = mesh(new THREE.CylinderGeometry(0.33, 0.27, 0.5, 28), mats.gold, 0, 0.27, 0);
  chest.scale.z = 0.78;
  torso.add(chest);
  for (const side of [-1, 1]) {
    const pec = mesh(new THREE.SphereGeometry(0.15, 18, 12), mats.gold, 0.12 * side, 0.38, 0.17);
    pec.scale.set(1, 0.75, 0.55);
    torso.add(pec);
    const rivet = mesh(new THREE.SphereGeometry(0.035, 10, 8), mats.goldDark, 0.2 * side, 0.5, 0.15);
    torso.add(rivet);
    // red sash straps over the shoulders
    const strap = mesh(new THREE.BoxGeometry(0.12, 0.04, 0.42), mats.red, 0.22 * side, 0.54, 0);
    torso.add(strap);
  }
  for (const side of [-1, 1]) {
    const ab = mesh(new THREE.SphereGeometry(0.1, 14, 10), mats.gold, 0.08 * side, 0.15, 0.17);
    ab.scale.set(1, 0.75, 0.45);
    torso.add(ab);
  }
  const neck = mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.12, 16), mats.skin, 0, 0.58, 0);
  torso.add(neck);

  // cape hangs from the shoulders, pivoting at the top
  const cape = group("cape", 0, 0.54, -0.2);
  cape.rotation.x = 0.15;
  const capeGeo = new THREE.PlaneGeometry(0.62, 0.95, 6, 8);
  capeGeo.translate(0, -0.475, 0);
  // gentle curve so it wraps the back
  const cp = capeGeo.attributes.position;
  for (let i = 0; i < cp.count; i++) cp.setZ(i, -0.25 * (cp.getX(i) / 0.31) ** 2 * 0.3);
  capeGeo.computeVertexNormals();
  cape.add(mesh(capeGeo, mats.red));
  torso.add(cape);

  torso.add(buildHead());
  const L = buildArm(-1);
  const R = buildArm(1);
  L.hand.add(buildSword());
  torso.add(L.arm, R.arm);
  hips.add(buildLeg(-1), buildLeg(1));
  return root;
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

function makeScene() {
  const scene = new THREE.Group();
  scene.name = "TrojanScene";
  const body = buildBody();
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
