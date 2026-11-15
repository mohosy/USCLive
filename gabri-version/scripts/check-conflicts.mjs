// Run with: node scripts/check-conflicts.mjs
// Checks the schedule-conflict rules (src/lib/conflicts.ts): overlap, back-to-back too tight, no conflict,
// and "Register anyway".
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function compile(file) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { exports, Date, require: (name) => { throw new Error('Unexpected import: ' + name); } }, { filename: file });
  return exports;
}
const C = compile('src/lib/conflicts.ts');
// Tuesday Nov 17 2026, local time
const at = (h, m = 0) => new Date(2026, 10, 17, h, m, 0).toISOString();
const FBE = { kind: 'class', id: 'FBE 403', label: 'FBE 403', start: at(14), end: at(15, 20), buildingId: 'jkp', place: 'JKP 112' };
const BUAD = { kind: 'class', id: 'BUAD 307', label: 'BUAD 307', start: at(10), end: at(11, 20), buildingId: 'hoh', place: 'HOH 1' };
const JAZZ = { kind: 'event', id: 'ev_jazz', label: 'Thornton Jazz Night', start: at(19), end: at(21), buildingId: 'bov' };
const busy = [FBE, BUAD, JAZZ];
// walking minutes between buildings (same both ways); unknown pairs have no time
const WALK = { 'hoh>gal': 12, 'jkp>hoh': 3, 'hoh>jkp': 3, 'bov>tcc': 2, 'tcc>bov': 2, 'gal>jkp': 14 };
const walk = (a, b) => WALK[`${a}>${b}`] ?? WALK[`${b}>${a}`] ?? null;
const ev = (start, end, buildingId = 'tcc', id = 'ev_new') => ({ id, start, end, buildingId });

assert.equal(C.timeRange(at(14), at(15, 20)), '2:00-3:20 PM');
assert.equal(C.timeRange(at(11, 30), at(13)), '11:30 AM-1:00 PM');

// 1. overlap: the exact sentence, and the short mark
{
  const c = C.findConflicts(ev(at(14, 30), at(16)), busy, walk);
  assert.equal(c.length, 1);
  assert.equal(c[0].type, 'overlap');
  assert.equal(c[0].text, 'Conflicts with FBE 403, 2:00-3:20 PM, JKP 112');
  assert.equal(c[0].short, 'Overlaps FBE 403');
  assert.equal(C.conflictMark(c), 'Overlaps FBE 403');
  // an event without a place leaves it out
  assert.equal(C.findConflicts(ev(at(20), at(22)), busy, walk)[0].text, 'Conflicts with Thornton Jazz Night, 7:00-9:00 PM');
  // touching is not overlapping: ends exactly when the class starts, in the same building
  assert.equal(C.findConflicts(ev(at(13), at(14), 'jkp'), busy, walk).length, 0);
  // a one minute overlap is an overlap
  assert.equal(C.findConflicts(ev(at(13), at(14, 1), 'jkp'), busy, walk)[0].type, 'overlap');
  // an event containing the class, and one inside it
  assert.equal(C.findConflicts(ev(at(13), at(17)), busy, walk)[0].type, 'overlap');
  assert.equal(C.findConflicts(ev(at(14, 30), at(15)), busy, walk)[0].type, 'overlap');
}
// 2. back to back and too tight: the walk is longer than the gap
{
  const c = C.findConflicts(ev(at(11, 25), at(12, 30), 'gal'), busy, walk);
  assert.equal(c.length, 1);
  assert.equal(c[0].type, 'tight');
  assert.equal(c[0].text, 'Starts 5 min after BUAD 307 ends, 12 min walk');
  assert.equal(c[0].gapMin, 5); assert.equal(c[0].walkMin, 12);
  assert.equal(c[0].short, 'Tight after BUAD 307');
  // the other way round: this event ends just before the class, far away
  const d = C.findConflicts(ev(at(12, 30), at(13, 52), 'gal'), busy, walk);
  assert.equal(d[0].text, 'Ends 8 min before FBE 403 starts, 14 min walk');
  assert.equal(d[0].short, 'Tight before FBE 403');
  // no gap at all: it says so in words, not "0 min"
  assert.equal(C.findConflicts(ev(at(11, 20), at(12), 'gal'), busy, walk)[0].text, 'Starts right when BUAD 307 ends, 12 min walk');
}
// 3. no conflict
{
  assert.equal(C.findConflicts(ev(at(16), at(17)), busy, walk).length, 0, 'free afternoon');
  assert.equal(C.findConflicts(ev(at(11, 25), at(12, 30), 'jkp'), busy, walk).length, 0, 'back to back but the walk (3 min) fits in the gap (5 min)');
  assert.equal(C.findConflicts(ev(at(11, 32), at(12, 30), 'gal'), busy, walk).length, 0, 'a 12 min walk fits in a 12 min gap');
  assert.equal(C.findConflicts(ev(at(11, 20), at(12), 'hoh'), busy, walk).length, 0, 'same building: no walk needed');
  assert.equal(C.findConflicts(ev(at(12, 30), at(13, 30), 'gal'), busy, walk).length, 0, 'an hour apart is not tight, however far');
  assert.equal(C.findConflicts(ev(at(11, 25), at(12, 30), 'xyz'), busy, walk).length, 0, 'unknown walking time: no tight-connection claim');
  assert.equal(C.findConflicts(ev(at(19), at(21), 'bov', 'ev_jazz'), busy, walk).length, 0, 'an event never conflicts with itself');
  assert.equal(C.findConflicts(ev(at(14, 30), at(16)), [], walk).length, 0, 'an empty schedule');
  assert.equal(C.conflictMark([]), null);
}
// 4. several at once: overlaps come first, and the mark counts the rest
{
  const c = C.findConflicts(ev(at(11, 25), at(14, 30), 'gal'), busy, walk);
  assert.equal(c.map((x) => x.type).join(), 'overlap,tight');
  assert.equal(C.conflictMark(c), 'Overlaps FBE 403 +1');
}
// 5. "Register anyway": a conflict stops and asks; saying anyway goes through; no conflict never asks
{
  const c = C.findConflicts(ev(at(14, 30), at(16)), busy, walk);
  assert.equal(C.conflictDecision(c, false), 'ask');
  assert.equal(C.conflictDecision(c, true), 'go');
  assert.equal(C.conflictDecision([], false), 'go');
  assert.equal(C.conflictDecision([], true), 'go');
  // once you are registered anyway, the event is on your schedule and still carries its mark
  const mine = [...busy, { kind: 'event', id: 'ev_new', label: 'New event', start: at(14, 30), end: at(16), buildingId: 'tcc' }];
  assert.equal(C.conflictMark(C.findConflicts(ev(at(14, 30), at(16)), mine, walk)), 'Overlaps FBE 403', 'the mark does not count the event itself');
}

console.log('Conflict checks passed: overlap, back-to-back too tight, no conflict, several at once, register anyway.');
