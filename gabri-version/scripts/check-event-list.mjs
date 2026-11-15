// Run with: node scripts/check-event-list.mjs
// Checks how the Events list reads (src/lib/eventList.ts): the tile each event gets, the sections
// ("Live now · N", "Starting soon", "Later today", ...), the short times and "Register by" wording.
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
const L = compile('src/lib/eventList.ts');
const MIN = 60_000;
// Sunday Nov 15 2026, 3:00 PM local time
const NOW = new Date(2026, 10, 15, 15, 0, 0);
const at = (min) => new Date(+NOW + min * MIN).toISOString();
const day = (d, h, m = 0) => new Date(2026, 10, 15 + d, h, m, 0).toISOString();
const ev = (title, category, startMin, endMin, more = {}) => ({ id: title, title, category, start: at(startMin), end: at(endMin), ...more });
// lists come back from another JS realm, so compare them as text
const same = (a, b, msg) => assert.equal(JSON.stringify(a), JSON.stringify(b), msg);
const kind = (title, category, more) => L.tileFor({ title, category, ...more }).kind;

// 1. tiles by type
assert.equal(kind('Football: USC vs UCLA', 'sports_watch', { game: { sport: 'football' } }), 'sports');
assert.equal(kind('Pickup soccer — need 4 more!', 'sports_play'), 'sports');
assert.equal(kind('Startup Pitch Night', 'student'), 'club', 'free pizza does not make it a food event');
assert.equal(kind('Club fair tabling on Trousdale', 'student'), 'club');
assert.equal(kind('Thornton Jazz Night', 'usc'), 'club');
assert.equal(kind('Boba study break', 'student'), 'food');
assert.equal(kind('Food truck night at the Village', 'community', { tags: ['food'] }), 'food');
assert.equal(kind('Sunday social', 'student', { tags: ['food'] }), 'food', 'a "food" tag is enough');
assert.equal(kind('WRIT 340 peer review swap', 'academic'), 'academic');
assert.equal(kind('Late study jam (free snacks)', 'academic'), 'academic', 'the event type wins over a food word');
assert.equal(kind('Goldman Sachs info session', 'career'), 'career');
assert.equal(kind('Coffee chats with IB analysts', 'career'), 'career', 'career wins over "coffee"');

// 2. the sport, for the tile's icon
const sport = (title, more) => L.tileFor({ title, category: 'sports_watch', ...more }).sport;
assert.equal(sport("Women's Volleyball vs. UCLA", { game: { sport: 'volleyball' } }), 'volleyball');
assert.equal(sport('Football: USC vs UCLA', { game: { sport: 'football' } }), 'football');
assert.equal(sport("Men's Basketball: USC vs Oregon", { game: { sport: 'basketball' } }), 'basketball');
assert.equal(sport('Baseball vs. Stanford'), 'baseball');
assert.equal(sport("Women's Soccer vs. Washington"), 'soccer');
assert.equal(sport("Men's Tennis vs. Pepperdine"), 'tennis');
assert.equal(sport('Night swim'), 'swim');
assert.equal(sport("Men's Water Polo vs. Cal"), 'swim');
assert.equal(sport('Sunset yoga on the Quad'), null, 'a sport with no icon of its own');
assert.equal(L.tileFor({ title: 'Boba study break', category: 'student' }).sport, null);

// 3. sections, in order, with the live count
{
  const list = [
    ev('WRIT 340', 'academic', 180, 270),
    ev('Football', 'sports_watch', -90, 60),
    ev('Info session', 'career', 0, 0, { start: day(4, 18), end: day(4, 19) }),
    ev('Boba', 'student', 11, 71),
    ev('Pitch night', 'student', -30, 120),
    ev('Brunch', 'student', 0, 0, { start: day(1, 10), end: day(1, 12) }),
    ev('Ended', 'student', -200, -100),
    ev('Exactly an hour', 'student', 60, 90),
    ev('Just over an hour', 'student', 61, 90),
  ];
  const g = L.groupEvents(list, NOW);
  same(g.map((x) => x.section), ['live', 'soon', 'today', 'tomorrow', 'week', 'past']);
  assert.equal(g[0].label, 'Live now · 2');
  same(g[0].events.map((e) => e.title), ['Football', 'Pitch night'], 'live: earliest start first');
  assert.equal(g[1].label, 'Starting soon');
  same(g[1].events.map((e) => e.title), ['Boba', 'Exactly an hour']);
  assert.equal(g[2].label, 'Later today');
  same(g[2].events.map((e) => e.title), ['Just over an hour', 'WRIT 340']);
  assert.equal(g[3].label, 'Tomorrow');
  assert.equal(g[4].label, 'Later this week');
  same(L.groupEvents([], NOW), [], 'no events: no sections');
  // late at night, an event after midnight is "Tomorrow", not "Later today"
  const late = new Date(2026, 10, 15, 23, 30);
  assert.equal(L.sectionOf({ start: day(1, 1), end: day(1, 2) }, late), 'tomorrow');
  assert.equal(L.sectionOf({ start: day(1, 0, 10), end: day(1, 1) }, late), 'soon', 'but within the hour it is still "Starting soon"');
}

// 4. the time on the second line
assert.equal(L.shortTime(day(0, 2)), '2 AM');
assert.equal(L.shortTime(day(0, 13, 15)), '1:15 PM');
assert.equal(L.shortTime(day(0, 0)), '12 AM');
assert.equal(L.shortTime(day(0, 12, 5)), '12:05 PM');
assert.equal(L.whenLine({ start: at(-30), end: day(1, 2) }, NOW), 'until 2 AM');
assert.equal(L.whenLine({ start: at(11), end: at(71) }, NOW), 'in 11 min');
assert.equal(L.whenLine({ start: day(0, 19, 15), end: day(0, 20) }, NOW), '7:15 PM');
assert.equal(L.whenLine({ start: day(4, 18), end: day(4, 19) }, NOW), '6 PM Thu');
assert.equal(L.whenLine({ start: day(1, 10), end: day(1, 12) }, NOW), '10 AM Mon');
assert.equal(L.whenLine({ start: day(-7, 19), end: day(-7, 21) }, NOW), 'Nov 8');

// 5. "Register by"
{
  const open = { closed: false, status: null };
  assert.equal(L.registerBy({ registrationDeadline: day(5, 12), registration: open }, NOW), 'Register by Fri');
  assert.equal(L.registerBy({ registrationDeadline: day(1, 12), registration: open }, NOW), 'Register by Mon');
  assert.equal(L.registerBy({ registrationDeadline: day(0, 18), registration: open }, NOW), 'Register by 6 PM', 'today: the time');
  assert.equal(L.registerBy({ registrationDeadline: day(12, 18), registration: open }, NOW), 'Register by Nov 27', 'more than a week away: the date');
  assert.equal(L.registerBy({ registrationDeadline: day(0, 14), registration: open }, NOW), null, 'deadline passed');
  assert.equal(L.registerBy({ registrationDeadline: day(5, 12), registration: { closed: true, status: null } }, NOW), null, 'sign-up closed');
  assert.equal(L.registerBy({ registrationDeadline: day(5, 12), registration: { closed: false, status: 'registered' } }, NOW), null, 'already registered');
  assert.equal(L.registerBy({ registration: open }, NOW), null, 'no deadline');
  assert.equal(L.registerBy({ registrationDeadline: day(5, 12) }, NOW), null, 'not a registration event');
}

console.log('Event list checks passed: tiles by type, sport icons, sections with live count, short times, Register by.');
