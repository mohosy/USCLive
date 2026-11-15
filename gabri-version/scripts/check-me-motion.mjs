// Run with: node scripts/check-me-motion.mjs
// Checks how "you" move on the map (src/lib/meMotion.ts): walk to a new location instead of jumping,
// face the way you walk, face the compass when standing, ignore jitter, and appear (no walk) on a big jump.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function compile(file) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { exports, require: (name) => { throw new Error('Unexpected import: ' + name); } }, { filename: file });
  return exports;
}
const M = compile('src/lib/meMotion.ts');
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

const LEAVEY = { lat: 34.021848, lng: -118.282864 };
const north = (p, m) => ({ lat: p.lat + m / 111_320, lng: p.lng });
const east = (p, m) => ({ lat: p.lat, lng: p.lng + m / (111_320 * Math.cos((p.lat * Math.PI) / 180)) });
/** run the clock forward in 16 ms frames */
const run = (me, from, ms) => { let t = from; for (; t <= from + ms; t += 16) me.step(t); return t; };

// distances and bearings
near(M.metersBetween(LEAVEY, north(LEAVEY, 100)), 100, 0.5, '100 m north');
near(M.bearingBetween(LEAVEY, north(LEAVEY, 50)), 0, 0.5, 'north is 0');
near(M.bearingBetween(LEAVEY, east(LEAVEY, 50)), 90, 0.5, 'east is 90');
assert.equal(M.turnBetween(350, 10), 20, 'turns the short way across north');
assert.equal(M.turnBetween(10, 350), -20);

// 1. a new spot 30 m east: walks there, facing east, and arrives exactly
{
  const me = new M.MeMotion(LEAVEY, 180);
  const to = east(LEAVEY, 30);
  me.step(1000);
  me.setTarget(to, 1000);
  assert.equal(me.moving, true, 'starts walking');
  me.step(1016);
  assert.ok(M.metersBetween(me.pos, LEAVEY) < 2, 'does not jump');
  run(me, 1016, 1500);
  const mid = M.metersBetween(me.pos, LEAVEY);
  assert.ok(mid > 3 && mid < 30, `part of the way there mid-walk (${mid.toFixed(1)} m)`);
  near(me.heading, 90, 1, 'faces the way it walks');
  run(me, 2516, 6000);
  assert.equal(me.moving, false, 'stops');
  near(M.metersBetween(me.pos, to), 0, 0.01, 'arrives exactly');
  near(me.heading, 90, 1, 'keeps facing the way it came when there is no compass');
}

// 2. every walk ends within 4.5 s, however far (under the jump limit)
{
  const me = new M.MeMotion(LEAVEY);
  me.step(0);
  me.setTarget(north(LEAVEY, 350), 0);
  run(me, 0, 4600);
  assert.equal(me.moving, false, 'a 350 m walk is over within 4.5 s');
}

// 3. jitter is ignored; a jump across town is not walked
{
  const me = new M.MeMotion(LEAVEY);
  me.step(0);
  me.setTarget(north(LEAVEY, 1.2), 0);
  assert.equal(me.moving, false, '1.2 m is jitter');
  near(M.metersBetween(me.pos, LEAVEY), 0, 0.01, 'stays put');
  const far = north(LEAVEY, 900);
  me.setTarget(far, 0);
  assert.equal(me.moving, false, '900 m is not a walk');
  near(M.metersBetween(me.pos, far), 0, 0.01, 'appears there');
}

// 4. reduced motion: no walk at all
{
  const me = new M.MeMotion(LEAVEY);
  const to = east(LEAVEY, 40);
  me.setTarget(to, 0, true);
  assert.equal(me.moving, false);
  near(M.metersBetween(me.pos, to), 0, 0.01, 'placed at the new spot');
}

// 5. compass: standing still faces the compass; while walking the walking direction wins
{
  const me = new M.MeMotion(LEAVEY, 180);
  me.step(0);
  me.setCompass(270);
  run(me, 0, 2000);
  near(me.heading, 270, 1, 'standing: faces the compass');
  me.setTarget(north(LEAVEY, 40), 2016);
  run(me, 2016, 1500);
  near(me.heading, 0, 1, 'walking north: faces north even though the compass says west');
  run(me, 3516, 8000);
  near(me.heading, 270, 1, 'stopped: back to the compass');
  me.setCompass(null);
  run(me, 12000, 1000);
  near(me.heading, 270, 1, 'compass gone: keeps its last heading');
}

// 6. before any walk or compass it faces wherever the view says (toward the camera); afterwards it does not
{
  const me = new M.MeMotion(LEAVEY);
  me.setFallbackHeading(200);
  assert.equal(me.heading, 200);
  me.step(0);
  me.setTarget(east(LEAVEY, 20), 0);
  run(me, 0, 6000);
  me.setFallbackHeading(10);
  near(me.heading, 90, 1, 'a walked heading is not overridden');
}

// 7. a new fix mid-walk: carries on from where it is, no jump back
{
  const me = new M.MeMotion(LEAVEY);
  me.step(0);
  me.setTarget(east(LEAVEY, 40), 0);
  run(me, 0, 1000);
  const before = { ...me.pos };
  me.setTarget(north(east(LEAVEY, 40), 30), 1016);
  me.step(1032);
  assert.ok(M.metersBetween(me.pos, before) < 1.5, 'continues from where it was');
  run(me, 1032, 6000);
  near(M.metersBetween(me.pos, north(east(LEAVEY, 40), 30)), 0, 0.01, 'ends at the newest spot');
}

console.log('Me-motion checks passed: walks instead of jumping, faces its direction, compass when standing, jitter ignored, far jumps and reduced motion snap, mid-walk updates.');
