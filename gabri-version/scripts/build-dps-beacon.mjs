/**
 * Builds public/models/dps-beacon.glb: a red police beacon on a short pole, for DPS alerts on the map.
 * Made from three.js primitives (no downloaded assets). Run: node scripts/build-dps-beacon.mjs
 * Units are meters, Y up. About 1.1 m tall; the maps scale it up.
 */
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { writeFileSync } from "node:fs";

globalThis.FileReader = class {
  _done(r) { this.result = r; this.onload?.({ target: this }); this.onloadend?.({ target: this }); }
  readAsArrayBuffer(b) { b.arrayBuffer().then((r) => this._done(r)); }
  readAsDataURL(b) { b.arrayBuffer().then((r) => this._done(`data:${b.type || "application/octet-stream"};base64,${Buffer.from(r).toString("base64")}`)); }
};

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.15, ...o });
const POLE = mat("#9aa0a8", { roughness: 0.35, metalness: 0.5 });
const DARK = mat("#26262b", { roughness: 0.6 });
const RED = mat("#ff2d20", { emissive: "#ff1a10", emissiveIntensity: 1.4, roughness: 0.25 });
const GLOW = mat("#ffd2cc", { emissive: "#ff8a80", emissiveIntensity: 1.2 });
const WHITE = mat("#f5f5f7", { roughness: 0.4 });

const scene = new THREE.Scene();
const g = new THREE.Group();
g.name = "dps-beacon";
scene.add(g);
const add = (geo, m, y) => { const mesh = new THREE.Mesh(geo, m); mesh.position.y = y; g.add(mesh); return mesh; };

add(new THREE.CylinderGeometry(0.16, 0.19, 0.04, 28), DARK, 0.02); // base plate
add(new THREE.CylinderGeometry(0.035, 0.04, 0.72, 16), POLE, 0.4); // pole
add(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 16), WHITE, 0.62); // reflective band
add(new THREE.CylinderGeometry(0.17, 0.19, 0.08, 32), DARK, 0.8); // beacon housing
add(new THREE.CylinderGeometry(0.15, 0.16, 0.12, 32), RED, 0.9); // light ring
add(new THREE.SphereGeometry(0.15, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), RED, 0.96); // dome
add(new THREE.SphereGeometry(0.06, 16, 12), GLOW, 1.02); // hot spot inside the dome
add(new THREE.CylinderGeometry(0.03, 0.04, 0.03, 12), DARK, 1.12); // cap

new GLTFExporter().parse(
  scene,
  (glb) => { writeFileSync(new URL("../public/models/dps-beacon.glb", import.meta.url), Buffer.from(glb)); console.log("wrote dps-beacon.glb", glb.byteLength, "bytes"); },
  (err) => { console.error(err); process.exit(1); },
  { binary: true },
);
