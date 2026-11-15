// Run with: node scripts/check-demo-time.mjs
// Checks that demo events follow the clock (src/lib/state.ts), not the moment the server started:
// regenerated at 30 minutes old, or straight away after nobody had the app open for a few minutes,
// keeping what people did (going, invites, registrations, their own posts) and never duplicating a demo post.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const MIN = 60_000;
let clock = Date.parse('2026-11-15T18:00:00Z');
class FakeDate extends Date {
  constructor(...a) { if (a.length) super(...a); else super(clock); }
  static now() { return clock; }
}

function compile(file, imports, globals) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { exports, ...globals, require: name => { if (imports[name]) return imports[name]; throw new Error('Unexpected import: ' + name); } }, { filename: file });
  return exports;
}

const R = compile('src/lib/registration.ts', {}, {});

// a tiny stand-in for the store: demo events 15 and 45 minutes from "now", plus one demo post that is not marked "seed"
const seed = (now) => [
  { id: 'ev_001', title: 'Boba study break', source: 'seed', start: new Date(now + 15 * MIN).toISOString(), end: new Date(now + 75 * MIN).toISOString(), attendees: ['u_maya', 'anon_0'], invitees: [], registrationType: 'native' },
  { id: 'ev_002', title: 'Resume reviews', source: 'seed', start: new Date(now + 45 * MIN).toISOString(), end: new Date(now + 165 * MIN).toISOString(), attendees: [], invitees: [] },
  { id: 'ev_003', title: 'FREE AIRPODS', source: 'user', start: new Date(now).toISOString(), end: new Date(now + 60 * MIN).toISOString(), attendees: [], invitees: [] },
];
const fresh = () => ({
  seededAt: clock, events: seed(clock), users: [{ id: 'u_me' }, { id: 'u_maya' }], history: [], inbox: [], scannedInbox: [],
  notifications: [], alerts: [], liveScriptIndex: 0, lastLiveTick: 0, reminded: [], registrations: [],
});
let mem = fresh();
const store = { DEMO_ID: 'u_me', fresh, memoryDb: () => mem, requestCtx: { run: (_ctx, fn) => fn() } };
const S = compile('src/lib/state.ts', { './store': store, './registration': R }, { Date: FakeDate, process: { env: {} }, console, AbortSignal, fetch: () => { throw new Error('no network in this check'); } });

const request = () => S.runWithState(async () => {});
const at = async (ms) => { clock = ms; await request(); };
/** someone has the app open: a request every 8 seconds up to `until` */
const open = async (until) => { while (clock + 8000 <= until) await at(clock + 8000); await at(until); };
const minsFromNow = (id) => Math.round((+new Date(mem.events.find((e) => e.id === id).start) - clock) / MIN);

const T0 = clock;
await request();
assert.equal(minsFromNow('ev_001'), 15, 'fresh: 15 minutes away');

// 1. the app is open for 20 minutes: time passes normally, nothing is regenerated
await open(T0 + 20 * MIN);
assert.equal(mem.seededAt, T0, 'no refresh while the set is under 30 minutes old');
assert.equal(minsFromNow('ev_001'), -5, 'the event started 5 minutes ago');

// what people did since the set was generated
mem.events[0].attendees.push('u_me');                                   // going
mem.events[1].invitees.push('u_maya');                                  // invited a friend
mem.events.push({ id: 'ev_mine', title: 'My study group', source: 'user', start: new Date(clock).toISOString(), end: new Date(clock + 60 * MIN).toISOString(), attendees: ['u_me'], invitees: [] });
mem.registrations.push({ id: 'reg_1', eventId: 'ev_002', userId: 'u_me', status: 'registered', createdAt: '', updatedAt: '' });

// 2. still open at 30 minutes: regenerated relative to now, and nothing people did is lost
await open(T0 + 30 * MIN);
assert.equal(mem.seededAt, clock, 'refreshed at 30 minutes old');
assert.equal(minsFromNow('ev_001'), 15, 'the event is 15 minutes away again');
assert.equal(minsFromNow('ev_002'), 45);
assert.ok(mem.events.find((e) => e.id === 'ev_001').attendees.includes('u_me'), 'still going');
assert.ok(mem.events.find((e) => e.id === 'ev_001').attendees.includes('anon_0'), 'seeded crowd still there');
assert.ok(mem.events.find((e) => e.id === 'ev_002').invitees.includes('u_maya'), 'invite kept');
assert.ok(mem.events.find((e) => e.id === 'ev_002').attendees.includes('u_me'), 'registration put back on the going list');
assert.equal(mem.registrations.length, 1, 'registration kept');
assert.equal(mem.events.filter((e) => e.id === 'ev_mine').length, 1, "the person's own post is kept, once");
assert.equal(new Set(mem.events.map((e) => e.id)).size, mem.events.length, 'no duplicate ids');
assert.equal(mem.events.filter((e) => e.id === 'ev_003').length, 1, 'the demo post is not duplicated');

// 3. a second refresh still does not duplicate anything
const T1 = clock;
await open(T1 + 30 * MIN);
assert.equal(mem.seededAt, clock);
assert.equal(new Set(mem.events.map((e) => e.id)).size, mem.events.length, 'no duplicate ids after a second refresh');
assert.equal(mem.events.length, 4);

// 4. nobody has the app open for 10 minutes, then someone opens it: a fresh set straight away
const T2 = clock;
await open(T2 + 5 * MIN);
assert.equal(mem.seededAt, T2, 'open and under 30 minutes: no refresh');
await at(T2 + 15 * MIN);
assert.equal(mem.seededAt, clock, 'refreshed on the first request after the app sat closed');
assert.equal(minsFromNow('ev_001'), 15);

// 5. a short gap is not "closed": no refresh
const T3 = clock;
await at(T3 + 2 * MIN);
assert.equal(mem.seededAt, T3, 'a 2 minute gap does not refresh');

// 6. the server just started (it has seen no request yet) with a set generated long ago: refreshed on the first request
mem = { ...fresh(), seededAt: clock - 5 * 3600_000 };
await request();
assert.equal(mem.seededAt, clock, 'an old saved set is refreshed on the first request');

console.log('Demo time checks passed: follows the clock, 30 minute refresh, fresh after sitting closed, keeps going/invites/registrations/own posts, no duplicates.');
