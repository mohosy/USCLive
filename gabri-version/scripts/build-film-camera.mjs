/**
 * Builds public/models/film-camera.glb: a chunky vintage film camera on a wooden tripod,
 * made from three.js primitives (no downloaded assets). Run: node scripts/build-film-camera.mjs
 * Units are meters, Y up, lens pointing +X. About 1.15 m tall; the maps scale it up.
 */
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { writeFileSync } from "node:fs";

// GLTFExporter uses FileReader, which Node doesn't have
globalThis.FileReader = class {
  _done(r) { this.result = r; this.onload?.({ target: this }); this.onloadend?.({ target: this }); }
  readAsArrayBuffer(b) { b.arrayBuffer().then((r) => this._done(r)); }
  readAsDataURL(b) { b.arrayBuffer().then((r) => this._done(`data:${b.type || "application/octet-stream"};base64,${Buffer.from(r).toString("base64")}`)); }
};

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.15, ...o });
const BODY = mat("#3b3b40", { roughness: 0.45, metalness: 0.25 });
const DARK = mat("#232327", { roughness: 0.6 });
const CHROME = mat("#d4d7dc", { roughness: 0.25, metalness: 0.6 });
const WOOD = mat("#c79a68", { roughness: 0.7 });
const GLASS = mat("#2f5d9a", { roughness: 0.1, metalness: 0.3, emissive: "#1d3f73", emissiveIntensity: 0.6 });
const RED = mat("#ff3b30", { emissive: "#ff3b30", emissiveIntensity: 1.2 });
const PLATE = mat("#e9e6df", { roughness: 0.5 });

const scene = new THREE.Scene();
const cam = new THREE.Group();
cam.name = "film-camera";
scene.add(cam);
const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  cam.add(mesh);
  return mesh;
};
const zCyl = (r, depth, m, x, y, z, seg = 28) => add(new THREE.CylinderGeometry(r, r, depth, seg), m, x, y, z, Math.PI / 2, 0, 0); // axis along Z
const xCyl = (r1, r2, len, m, x, y, z, seg = 28) => add(new THREE.CylinderGeometry(r2, r1, len, seg), m, x, y, z, 0, 0, -Math.PI / 2); // axis along X, r1 at -x
function rod(a, b, r, m) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.8, A.distanceTo(B), 10), m);
  mesh.position.copy(A).add(B).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  cam.add(mesh);
  return mesh;
}

// tripod: three wooden legs, metal clamps and spiked feet
const headY = 0.56;
for (const deg of [90, 210, 330]) {
  const a = (deg * Math.PI) / 180;
  const top = [Math.cos(a) * 0.05, headY, Math.sin(a) * 0.05];
  const foot = [Math.cos(a) * 0.3, 0.03, Math.sin(a) * 0.3];
  rod(top, foot, 0.026, WOOD);
  const mid = top.map((v, i) => v + (foot[i] - v) * 0.55);
  rod([mid[0], mid[1] + 0.02, mid[2]], [mid[0], mid[1] - 0.02, mid[2]], 0.032, DARK); // clamp
  rod([foot[0], 0.05, foot[2]], [foot[0], 0, foot[2]], 0.012, CHROME); // spike
}
add(new THREE.CylinderGeometry(0.075, 0.085, 0.04, 28), DARK, 0, headY, 0); // tripod head
add(new THREE.CylinderGeometry(0.04, 0.05, 0.08, 20), DARK, 0, headY + 0.06, 0); // pan head
rod([-0.04, headY + 0.07, 0.02], [-0.3, headY + 0.03, 0.08], 0.011, DARK); // pan handle
add(new THREE.SphereGeometry(0.022, 16, 12), DARK, -0.3, headY + 0.03, 0.08);

// camera body
const bodyY = headY + 0.2;
add(new THREE.BoxGeometry(0.42, 0.22, 0.2), BODY, 0, bodyY, 0);
add(new THREE.BoxGeometry(0.2, 0.12, 0.005), PLATE, 0.02, bodyY, 0.103); // side plate
for (const [dx, dy] of [[-0.04, 0.02], [0.03, 0.02], [0.08, -0.02]]) zCyl(0.014, 0.012, CHROME, dx, bodyY + dy, 0.11, 16); // dials
zCyl(0.03, 0.02, DARK, -0.15, bodyY - 0.04, 0.11); // crank hub
rod([-0.15, bodyY - 0.04, 0.12], [-0.21, bodyY - 0.1, 0.13], 0.008, CHROME); // crank arm
add(new THREE.SphereGeometry(0.015, 12, 10), DARK, -0.21, bodyY - 0.1, 0.13);
xCyl(0.022, 0.03, 0.08, DARK, -0.25, bodyY + 0.05, 0); // eyepiece
add(new THREE.SphereGeometry(0.018, 14, 10), RED, 0.17, bodyY + 0.125, 0.06); // "recording" light

// lens: barrel, glass, then a wide hood (the funny oversized bit)
xCyl(0.06, 0.06, 0.07, CHROME, 0.245, bodyY, 0);
xCyl(0.07, 0.07, 0.03, DARK, 0.29, bodyY, 0);
xCyl(0.065, 0.13, 0.2, DARK, 0.405, bodyY, 0);
xCyl(0.12, 0.12, 0.004, GLASS, 0.5, bodyY, 0);

// film magazine: two big reels on top
const reelY = bodyY + 0.24;
for (const x of [-0.1, 0.14]) {
  zCyl(0.15, 0.055, DARK, x, reelY, 0, 40);
  zCyl(0.153, 0.01, CHROME, x, reelY, 0.03, 40); // rim
  zCyl(0.04, 0.07, CHROME, x, reelY, 0, 20); // hub
  for (const k of [0, 1, 2]) { // spokes holes look
    const a = (k * 2 * Math.PI) / 3 + 0.4;
    zCyl(0.028, 0.065, BODY, x + Math.cos(a) * 0.09, reelY + Math.sin(a) * 0.09, 0, 16);
  }
}
add(new THREE.BoxGeometry(0.12, 0.08, 0.12), BODY, 0.02, bodyY + 0.14, 0); // magazine neck

new GLTFExporter().parse(
  scene,
  (glb) => { writeFileSync(new URL("../public/models/film-camera.glb", import.meta.url), Buffer.from(glb)); console.log("wrote film-camera.glb", glb.byteLength, "bytes"); },
  (err) => { console.error(err); process.exit(1); },
  { binary: true },
);
