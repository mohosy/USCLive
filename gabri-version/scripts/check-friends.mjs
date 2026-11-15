// Run with: node scripts/check-friends.mjs
// Checks the friend-request rules (src/lib/friends.ts) and the Settings rules (src/lib/prefs.ts) on their own.
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
const F = compile('src/lib/friends.ts');
const P = compile('src/lib/prefs.ts');
const same = (a, b, msg) => assert.equal(JSON.stringify(a), JSON.stringify(b), msg);
const NOW = Date.parse('2026-11-15T18:00:00Z');
let n = 0;
const newId = () => `fr_${++n}`;
const people = () => [
  { id: 'me', friends: ['maya'], classes: [{ code: 'CSCI 104' }, { code: 'WRIT 340' }, { code: 'FBE 403' }] },
  { id: 'maya', friends: ['me'], classes: [{ code: 'WRIT 340' }, { code: 'CSCI 104' }] },
  { id: 'kai', friends: [], classes: [] },
  { id: 'leah', friends: [] },
  { id: 'anon_3', friends: [] },
];
const ok = (r) => { assert.equal(r.ok, true, r.error); return r; };
const err = (r, status) => { assert.equal(r.ok, false); assert.equal(r.status, status, r.error); return r; };

// 1. send: one pending request, shown from both sides
{
  const u = people(), reqs = [];
  const r = ok(F.sendRequest(u, reqs, 'me', 'kai', NOW, newId));
  assert.equal(r.relation, 'outgoing'); assert.equal(r.becameFriends, false);
  assert.equal(reqs.length, 1);
  assert.equal(F.relation(u, reqs, 'me', 'kai'), 'outgoing');
  assert.equal(F.relation(u, reqs, 'kai', 'me'), 'incoming');
  assert.equal(u[0].friends.includes('kai'), false, 'not friends until accepted');
}
// 2. no duplicates, not yourself, not someone who does not exist, not the anonymous crowd, not a friend
{
  const u = people(), reqs = [];
  ok(F.sendRequest(u, reqs, 'me', 'kai', NOW, newId));
  err(F.sendRequest(u, reqs, 'me', 'kai', NOW, newId), 409);
  assert.equal(reqs.length, 1, 'still one request');
  err(F.sendRequest(u, reqs, 'me', 'me', NOW, newId), 400);
  err(F.sendRequest(u, reqs, 'me', 'nobody', NOW, newId), 404);
  err(F.sendRequest(u, reqs, 'me', 'anon_3', NOW, newId), 404);
  err(F.sendRequest(u, reqs, 'me', 'maya', NOW, newId), 409);
  assert.equal(reqs.length, 1);
}
// 3. accept: both become friends and the request is gone
{
  const u = people(), reqs = [];
  ok(F.sendRequest(u, reqs, 'kai', 'me', NOW, newId));
  const r = ok(F.answerRequest(u, reqs, 'me', 'kai', true));
  assert.equal(r.relation, 'friends'); assert.equal(r.becameFriends, true);
  assert.ok(u[0].friends.includes('kai') && u[2].friends.includes('me'), 'friends both ways');
  assert.equal(reqs.length, 0);
  err(F.answerRequest(u, reqs, 'me', 'kai', true), 404);
}
// 4. decline and cancel: nobody becomes friends, and you can only answer a request that was sent to you
{
  const u = people(), reqs = [];
  ok(F.sendRequest(u, reqs, 'kai', 'me', NOW, newId));
  err(F.answerRequest(u, reqs, 'leah', 'kai', true), 404);
  err(F.answerRequest(u, reqs, 'kai', 'me', true), 404, );
  ok(F.answerRequest(u, reqs, 'me', 'kai', false));
  assert.equal(reqs.length, 0); assert.equal(u[0].friends.includes('kai'), false);
  ok(F.sendRequest(u, reqs, 'me', 'leah', NOW, newId));
  err(F.cancelRequest(reqs, 'leah', 'me'), 404);
  ok(F.cancelRequest(reqs, 'me', 'leah'));
  assert.equal(reqs.length, 0);
  err(F.cancelRequest(reqs, 'me', 'leah'), 404);
  ok(F.sendRequest(u, reqs, 'me', 'leah', NOW, newId)); // and you can ask again later
}
// 5. asking someone who already asked you accepts their request
{
  const u = people(), reqs = [];
  ok(F.sendRequest(u, reqs, 'kai', 'me', NOW, newId));
  const r = ok(F.sendRequest(u, reqs, 'me', 'kai', NOW, newId));
  assert.equal(r.becameFriends, true); assert.equal(reqs.length, 0);
  assert.equal(F.relation(u, reqs, 'me', 'kai'), 'friends');
}
// 6. unfriend: both ways, only if you are friends
{
  const u = people(), reqs = [];
  ok(F.unfriend(u, reqs, 'me', 'maya'));
  assert.equal(u[0].friends.includes('maya'), false); assert.equal(u[1].friends.includes('me'), false);
  err(F.unfriend(u, reqs, 'me', 'maya'), 409);
  err(F.unfriend(u, reqs, 'me', 'me'), 404);
  err(F.unfriend(u, reqs, 'me', 'nobody'), 404);
}
// 7. demo students accept after a short wait; real accounts never do
{
  const u = people(), reqs = [];
  ok(F.sendRequest(u, reqs, 'me', 'kai', NOW, newId));
  ok(F.sendRequest(u, reqs, 'leah', 'me', NOW, newId));
  const real = new Set(['me']);
  F.settleDemoRequests(u, reqs, real, NOW + 2000);
  assert.equal(reqs.length, 2, 'too soon: nothing happens');
  F.settleDemoRequests(u, reqs, real, NOW + 9000);
  assert.ok(u[0].friends.includes('kai'), 'the demo student accepted');
  assert.equal(reqs.length, 1, 'the request to a real account is still waiting');
  assert.equal(F.relation(u, reqs, 'me', 'leah'), 'incoming');
}
// 8. what you share
{
  const u = people();
  const events = [
    { attendees: ['me', 'maya', 'kai'], end: new Date(NOW + 3600_000).toISOString() },
    { attendees: ['me', 'maya'], end: new Date(NOW - 3600_000).toISOString() }, // over: does not count
    { attendees: ['maya'], end: new Date(NOW + 3600_000).toISOString() },
  ];
  same(F.sharedWith(u[0], u[1], events, NOW), { classes: 2, events: 1, line: '2 classes, 1 event together' });
  assert.equal(F.sharedWith(u[0], u[2], events, NOW).line, '1 event together');
  assert.equal(F.sharedWith(u[0], u[3], events, NOW).line, '', 'nothing shared: no line');
}

// 9. Settings: privacy is all off by default; a patch changes only what it names; bad values are dropped
{
  const d = P.DEFAULT_PREFS;
  same(d.privacy, { shareLocation: false, showGoing: false, schedule: 'nobody' }, 'privacy starts all off');
  const a = P.mergePrefs(d, { privacy: { showGoing: true } });
  assert.equal(a.privacy.showGoing, true); assert.equal(a.privacy.shareLocation, false); assert.equal(a.notify.food, true);
  const b = P.mergePrefs(a, { trojan: { plume: 'gold', cape: 'purple', jersey: 23 }, map: { openIn: 'satellite' }, notify: { food: false } });
  same(b.trojan, { plume: 'gold', cape: 'cardinal', jersey: 23 }, 'an unknown cape colour is ignored');
  assert.equal(b.map.openIn, 'satellite'); assert.equal(b.notify.food, false); assert.equal(b.privacy.showGoing, true, 'earlier changes are kept');
  const c = P.mergePrefs(b, { trojan: { jersey: 100 }, privacy: { shareLocation: 'yes', schedule: 'everyone' }, admin: true, notify: null });
  same(c, b, 'out-of-range, wrong-type and unknown fields change nothing');
  for (const j of [-1, 1.5, '7', null, 1000]) assert.equal(P.mergePrefs(d, { trojan: { jersey: j } }).trojan.jersey, 7);
  assert.equal(P.mergePrefs(d, { trojan: { jersey: 0 } }).trojan.jersey, 0); assert.equal(P.mergePrefs(d, { trojan: { jersey: 99 } }).trojan.jersey, 99);
  same(P.mergePrefs(d, 'nonsense'), d); same(P.mergePrefs(d, null), d); same(P.mergePrefs(d, [1, 2]), d);
  same(P.prefsOf({}), d, 'no saved settings: the defaults');
  assert.equal(P.prefsOf({ prefs: { ...d, map: { openIn: 'satellite' } } }).map.openIn, 'satellite');
}
// 10. which switch hides which notification
{
  assert.equal(P.notifySwitch({ kind: 'deadline' }), 'deadlines');
  assert.equal(P.notifySwitch({ kind: 'food' }), 'food');
  assert.equal(P.notifySwitch({ kind: 'safety' }), 'safety');
  assert.equal(P.notifySwitch({ kind: 'event', body: 'Starts in 16 min · 4 min walk' }), 'registered');
  assert.equal(P.notifySwitch({ kind: 'event', body: 'Maya invited you' }), null);
  assert.equal(P.notifySwitch({ kind: 'friend' }), null, 'friend requests always show');
}

console.log('Friends checks passed: request, no duplicates or self, accept, decline, cancel, mutual ask, unfriend, demo accept, shared line, settings defaults and validation, notification switches.');
