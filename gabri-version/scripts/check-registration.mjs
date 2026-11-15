// Run with: node scripts/check-registration.mjs
// Checks the registration rules in src/lib/registration.ts (and the event-page reader) on their own, without a server.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function compile(file, imports = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { exports, require: name => { if (imports[name]) return imports[name]; throw new Error('Unexpected import: ' + name); } }, { filename: file });
  return exports;
}
const R = compile('src/lib/registration.ts');

const HOUR = 3600_000;
const NOW = Date.parse('2026-11-14T20:00:00Z');
let n = 0;
const newId = () => `reg_${++n}`;
const event = (over = {}) => ({
  id: 'ev1', title: 'Test', start: new Date(NOW + 2 * HOUR).toISOString(), end: new Date(NOW + 3 * HOUR).toISOString(), createdAt: new Date(NOW - HOUR).toISOString(),
  host: { kind: 'org', name: 'Startup Garage', id: 'org_startup' }, attendees: [], registrationType: 'native', ...over,
});
const statuses = (regs, ev) => Object.fromEntries(regs.filter(r => r.eventId === ev.id).map(r => [r.userId, r.status]));
const ok = (r) => { assert.equal(r.ok, true, r.error); return r; };

// 1. register: one record, on the going list
{
  const ev = event({ capacity: 2 }), regs = [];
  const r = ok(R.register(ev, 'ann', regs, NOW, newId));
  assert.equal(r.status, 'registered'); assert.equal(r.changed, true);
  assert.deepEqual([...ev.attendees], ['ann']);
  assert.equal(regs.length, 1);

  // 2. duplicate register: same answer, no second record, nothing changes
  const again = ok(R.register(ev, 'ann', regs, NOW + 1000, newId));
  assert.equal(again.status, 'registered'); assert.equal(again.changed, false);
  assert.equal(again.registration.id, r.registration.id);
  assert.equal(regs.length, 1); assert.deepEqual([...ev.attendees], ['ann']);
}

// 3. full -> waitlist; 4. cancel -> the first person waiting moves up (in the order they joined)
{
  const ev = event({ capacity: 2 }), regs = [];
  ok(R.register(ev, 'ann', regs, NOW, newId));
  ok(R.register(ev, 'bob', regs, NOW + 1000, newId));
  const c = ok(R.register(ev, 'cat', regs, NOW + 2000, newId));
  const d = ok(R.register(ev, 'dan', regs, NOW + 3000, newId));
  assert.equal(c.status, 'waitlisted'); assert.equal(d.status, 'waitlisted');
  assert.deepEqual([...ev.attendees], ['ann', 'bob'], 'waitlisted people are not on the going list');
  assert.equal(ok(R.register(ev, 'cat', regs, NOW + 4000, newId)).changed, false, 'asking again while waitlisted changes nothing');
  assert.deepEqual({ ...R.counts(ev, regs) }, { registered: 2, waitlisted: 2, selfReported: 0, cancelled: 0 });

  const cancelled = ok(R.cancel(ev, 'ann', regs, NOW + 5000, newId));
  assert.equal(cancelled.status, 'cancelled'); assert.equal(cancelled.promoted, 'cat', 'the first to join the waitlist moves up');
  assert.deepEqual({ ...statuses(regs, ev) }, { ann: 'cancelled', bob: 'registered', cat: 'registered', dan: 'waitlisted' });
  assert.deepEqual([...ev.attendees].sort(), ['bob', 'cat']);
  assert.ok(ev.attendees.length <= ev.capacity, 'never over capacity');

  // leaving the waitlist promotes nobody
  assert.equal(ok(R.cancel(ev, 'dan', regs, NOW + 6000, newId)).promoted, undefined);
  // cancelling twice is refused; the record is kept, not duplicated
  const twice = R.cancel(ev, 'ann', regs, NOW + 7000, newId);
  assert.equal(twice.ok, false); assert.equal(twice.status, 404);
  // registering again after cancelling reuses the one record and goes to the back of the line
  const back = ok(R.register(ev, 'ann', regs, NOW + 8000, newId));
  assert.equal(back.status, 'waitlisted');
  assert.equal(regs.filter(r => r.userId === 'ann').length, 1, 'one record per person per event');
}

// 5. deadline passed (and event over) -> refused; an existing registration is still reported as it is
{
  const ev = event({ registrationDeadline: new Date(NOW - 60_000).toISOString() }), regs = [];
  const late = R.register(ev, 'ann', regs, NOW, newId);
  assert.equal(late.ok, false); assert.equal(late.status, 409); assert.equal(late.code, 'closed');
  assert.equal(regs.length, 0); assert.equal(ev.attendees.length, 0);
  assert.equal(R.isClosed(ev, NOW), true);

  const open = event({ id: 'ev2', registrationDeadline: new Date(NOW + HOUR).toISOString() });
  ok(R.register(open, 'bob', regs, NOW, newId));
  assert.equal(R.closesSoon(open, NOW), true, 'within 48 hours of the deadline');
  assert.equal(R.closesSoon(event({ registrationDeadline: new Date(NOW + 72 * HOUR).toISOString() }), NOW), false);
  assert.equal(ok(R.register(open, 'bob', regs, NOW + 2 * HOUR, newId)).status, 'registered', 'already registered stays registered after the deadline');
  assert.equal(R.register(open, 'cat', regs, NOW + 2 * HOUR, newId).code, 'closed');
  assert.equal(R.register(event({ id: 'ev3' }), 'ann', regs, NOW + 4 * HOUR, newId).code, 'ended');
}

// 6. the list is for the organizer only
{
  const ev = event();
  assert.equal(R.canManage(ev, { id: 'u1', accountType: 'creator', creatorOrgId: 'org_startup' }), true, 'creator posting for the hosting org');
  assert.equal(R.canManage(ev, { id: 'u2', accountType: 'creator', creatorOrgId: 'org_boba' }), false, 'creator for another org');
  assert.equal(R.canManage(ev, { id: 'u3', accountType: 'student', creatorOrgId: 'org_startup' }), false, 'a student account');
  assert.equal(R.canManage(ev, { id: 'u4', accountType: 'student' }), false);
  const mine = event({ host: { kind: 'user', name: 'Sofia', id: 'u_sofia' } });
  assert.equal(R.canManage(mine, { id: 'u_sofia', accountType: 'student' }), true, 'the person hosting');
  assert.equal(R.canManage(mine, { id: 'u_other', accountType: 'creator', creatorOrgId: 'org_startup' }), false);
  assert.equal(R.canManage(event({ host: { kind: 'usc', name: 'USC Career Center' } }), { id: 'u1', accountType: 'creator', creatorOrgId: 'org_career' }), false, 'no organizer on record: nobody');
}

// Handshake / Engage: only "self-reported", only after the student says so, never through the native route
{
  const ev = event({ registrationType: 'handshake', registrationUrl: 'https://usc.joinhandshake.com/' }), regs = [];
  const wrong = R.register(ev, 'ann', regs, NOW, newId);
  assert.equal(wrong.ok, false); assert.equal(wrong.code, 'not_native'); assert.match(wrong.error, /Handshake/);
  const said = ok(R.selfReport(ev, 'ann', regs, NOW, newId));
  assert.equal(said.status, 'self-reported'); assert.deepEqual([...ev.attendees], ['ann']);
  assert.equal(ok(R.selfReport(ev, 'ann', regs, NOW + 1, newId)).changed, false);
  assert.equal(R.selfReport(event({ id: 'n1' }), 'ann', regs, NOW, newId).code, 'not_external', 'native events use Register');
  ok(R.cancel(ev, 'ann', regs, NOW + 2, newId));
  assert.equal(ev.attendees.length, 0);
  assert.equal(R.register(event({ id: 'plain', registrationType: undefined }), 'ann', regs, NOW, newId).code, 'no_registration');
}

// people already on the going list (seed data) count as registered and fill the seats
{
  const ev = event({ capacity: 3, attendees: ['x1', 'x2', 'x3'] }), regs = [];
  assert.equal(ok(R.register(ev, 'ann', regs, NOW, newId)).status, 'waitlisted');
  assert.deepEqual({ ...R.counts(ev, regs) }, { registered: 3, waitlisted: 1, selfReported: 0, cancelled: 0 });
  const names = { x1: { name: 'Xi One', username: 'xi', school: 'viterbi' } };
  const list = R.rows(ev, regs, id => names[id]);
  assert.equal(list.length, 4); assert.equal(list[0].status, 'registered'); assert.equal(list.at(-1).status, 'waitlisted');
  assert.equal(list.find(r => r.username === 'xi').name, 'Xi One'); assert.ok(list.some(r => r.name === 'USC student'));
  // rebuilt demo events get their registered people back
  const rebuilt = event({ capacity: 3, attendees: [] });
  R.reapply([rebuilt], regs);
  assert.deepEqual([...rebuilt.attendees].sort(), ['x1', 'x2', 'x3'], 'waitlisted people are not put on the going list');
}

// CSV: quoted, and a value that looks like a formula cannot run in a spreadsheet
{
  const csv = R.toCsv([{ name: '=HYPERLINK("http://evil")', username: 'a"b', school: 'viterbi', status: 'registered', registeredAt: '2026-11-14T20:00:00.000Z' }]);
  const lines = csv.trim().split('\r\n');
  assert.equal(lines[0], '"Name","Username","School","Status","Registered at"');
  assert.ok(lines[1].startsWith(`"'=HYPERLINK(""http://evil"")"`), lines[1]);
  assert.ok(lines[1].includes('"a""b"'));
}

// the Engage / Handshake page reader: JSON-LD first, then meta tags; a sign-in wall is "unreadable"
{
  const P = compile('src/lib/eventImport.ts');
  const ld = P.parseEventPage(`<html><head><title>Engage</title><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Event","name":"Founders &amp; Funders Night","description":"Meet investors.","startDate":"2026-11-20T18:30:00-08:00","endDate":"2026-11-20T20:00:00-08:00","location":{"@type":"Place","name":"Ronald Tutor Hall","address":{"streetAddress":"3710 McClintock Ave"}}}]}</script></head></html>`);
  assert.equal(ld.title, 'Founders & Funders Night'); assert.equal(ld.start, '2026-11-21T02:30:00.000Z'); assert.equal(ld.end, '2026-11-21T04:00:00.000Z');
  assert.equal(ld.location, 'Ronald Tutor Hall, 3710 McClintock Ave');
  const og = P.parseEventPage(`<head><meta property="og:title" content="Resume Lab"><meta name="description" content="Bring a printed copy."><meta property="event:start_time" content="2026-11-18T22:00:00Z"></head>`);
  assert.equal(og.title, 'Resume Lab'); assert.equal(og.description, 'Bring a printed copy.'); assert.equal(og.start, '2026-11-18T22:00:00.000Z'); assert.equal(og.end, null);
  assert.equal(P.parseEventPage('<html><head><title>Sign in | Handshake</title></head><body>Please log in</body></html>'), null);
  assert.equal(P.parseEventPage('<script type="application/ld+json">{not json</script><title>Log in</title>'), null, 'a broken block never crashes the reader');
}

console.log('Registration checks passed: register, duplicate register, full -> waitlist, cancel -> promotion, deadline passed, organizer-only list, self-report, seeded attendees, CSV, page reader.');
