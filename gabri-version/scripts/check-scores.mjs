// Run with: node scripts/check-scores.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as zod from 'zod';
function compile(file, imports, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { exports, require: name => { if (imports[name]) return imports[name]; throw new Error('Unexpected import: ' + name); }, ...globals }, { filename: file });
  return exports;
}
// objects made inside vm have another Object prototype, so compare plain JSON copies
const j = x => JSON.parse(JSON.stringify(x));
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };
const eq = (a, b, msg) => { assert.deepStrictEqual(j(a), j(b), msg); checks++; };

const sports = compile('src/lib/sports.ts', {});
const scores = compile('src/lib/scores.ts', { './sports': sports });
const { SPORTS, VENUES, SPORT_IDS, teamColors } = sports;
const NOW = Date.UTC(2026, 10, 14, 20, 0, 0);

// ---- sports and venues
const ids = ['football', 'mbb', 'wbb', 'wvb', 'mvb', 'mwp', 'wwp', 'mswim', 'wswim', 'baseball', 'wsoc', 'wlax', 'bvb', 'mten', 'wten', 'track', 'mgolf', 'wgolf'];
eq([...SPORT_IDS].sort(), [...ids].sort(), 'all 18 sports');
for (const id of ids) {
  const c = SPORTS[id];
  ok(c && c.id === id && c.label && c.short && c.icsName, `${id} config`);
  ok(c.format && c.format.kind, `${id} format`);
  ok(Array.isArray(c.increments) && c.increments.length > 0, `${id} increments`);
  if (id.endsWith('golf')) ok(c.venueId === null, `${id} has no venue`);
  else ok(VENUES[c.venueId] && VENUES[c.venueId].lat > 33, `${id} venue exists`);
}
eq(teamColors('USC'), { color: '#990000', textColor: '#FFCC00' });
eq(teamColors('???'), { color: '#3a3a3c', textColor: '#ffffff' });

// ---- demo games
for (const id of ids) {
  const g = scores.createDemoGame(id, { now: NOW });
  const f = SPORTS[id].format;
  ok(g.source === 'demo' && g.sourceLabel === 'Demo' && g.uscSide === 'home' && g.home.abbr === 'USC', `${id} demo basics`);
  ok(g.state === 'live', `${id} demo is live`);
  const want = f.kind === 'periods' ? f.count : f.kind === 'innings' ? f.count : f.kind === 'sets' ? f.bestOf : f.kind === 'matches' ? f.total : null;
  if (want !== null) ok(g.line.length >= want, `${id} line table length`);
  else ok(g.line.length >= 3, `${id} points table`);
  ok(g.line.some(c => c.home !== null || c.away !== null), `${id} line has played columns`);
  ok(g.plays.length <= 8 && g.statusText, `${id} plays and status`);
  eq(g, scores.createDemoGame(id, { now: NOW }), `${id} deterministic`);
  if (f.kind === 'innings') ok(g.totals.length === 3 && g.totals[0].label === 'R', 'baseball totals');
  // advancing never breaks the rules, and returns a new object
  let cur = g;
  for (let m = 1; m <= 40; m++) {
    const nx = scores.advanceDemoGame(cur, NOW + m * 60_000);
    ok(nx.home.score >= cur.home.score && nx.away.score >= cur.away.score, `${id} scores never drop`);
    if (cur.state === 'final') ok(nx === cur, `${id} final stays`);
    cur = nx;
  }
  ok(cur.state === 'final' && cur.statusText === 'Final', `${id} ends as Final`);
  ok(cur !== g && g.state === 'live', `${id} advance leaves the old game alone`);
}
// football in the middle: clock counts down, scores are sums of legal plays
{
  const g = scores.createDemoGame('football', { now: NOW, startedMinutesAgo: 6 });
  ok(/^Q[1-4] \d+:\d\d$/.test(g.statusText), 'football status looks like Q2 8:36: ' + g.statusText);
  ok(g.home.score === g.line.reduce((n, c) => n + (c.home ?? 0), 0), 'score equals line sum');
}
// volleyball: sets end at 25 with a 2-point lead, never beyond 3 sets
for (const id of ['wvb', 'mvb']) {
  const g = scores.advanceDemoGame(scores.createDemoGame(id, { now: NOW, startedMinutesAgo: 0 }), NOW + 30 * 60_000);
  ok(g.state === 'final' && Math.max(g.home.score, g.away.score) === 3 && Math.min(g.home.score, g.away.score) <= 2, `${id} match to 3 sets`);
  g.line.forEach((c, i) => {
    if (c.home === null) return;
    const hi = Math.max(c.home, c.away), lo = Math.min(c.home, c.away), to = i === 4 ? 15 : 25;
    ok(hi >= to && hi - lo >= 2 && (hi === to || hi - lo === 2), `${id} set ${i + 1} ${c.home}-${c.away}`);
  });
}

// ---- applyScore
{
  const g = scores.createDemoGame('football', { now: NOW, startedMinutesAgo: 6 });
  const i = g.line.reduce((k, c, n) => (c.home !== null ? n : k), 0);
  const n = scores.applyScore(g, 'home', 6, NOW);
  ok(n !== g && n.home.score === g.home.score + 6, 'football +6 raises score');
  ok(n.line[i].home === g.line[i].home + 6, 'football +6 raises current quarter');
  ok(n.plays[0].delta === 6 && n.plays[0].side === 'home' && n.lastPlay.includes('Touchdown'), 'football +6 play');
  ok(g.home.score !== n.home.score, 'old game untouched');
  eq(scores.applyScore(g, 'home', 5, NOW), g, 'football +5 is not allowed');
  eq(scores.applyScore(g, 'away', 0, NOW), g, '+0 not allowed');
}
{
  // a volleyball set at 24-20 ends on the next point for USC
  let g = scores.createDemoGame('wvb', { now: NOW, startedMinutesAgo: 0 });
  g = j(g);
  g.line[0] = { label: 'Set 1', home: 24, away: 20 };
  g = scores.applyScore(g, 'home', 1, NOW);
  ok(g.home.score === 1 && g.plays[0].text === 'Set USC' && g.line[0].home === 25, 'set won at 25');
  ok(g.line[1].home === 0 && g.periodLabel === 'Set 2', 'next set starts');
  // 24-24 then one point is not enough
  let h = j(scores.createDemoGame('wvb', { now: NOW, startedMinutesAgo: 0 }));
  h.line[0] = { label: 'Set 1', home: 24, away: 24 };
  h = scores.applyScore(h, 'home', 1, NOW);
  ok(h.home.score === 0 && h.line[0].home === 25, '25-24 is not a set');
  h = scores.applyScore(h, 'home', 1, NOW);
  ok(h.home.score === 1 && h.line[0].home === 26, '26-24 wins');
}
{
  const g = scores.createDemoGame('baseball', { now: NOW, startedMinutesAgo: 3 });
  const n = scores.applyScore(g, 'home', 1, NOW);
  ok(n.totals[0].home === g.totals[0].home + 1 && n.home.score === g.home.score + 1, 'baseball +1 raises R');
}
{
  const g = scores.createDemoGame('mten', { now: NOW, startedMinutesAgo: 0 });
  const n = scores.applyScore(g, 'home', 1, NOW);
  ok(n.home.score === 1 && n.line[0].home === 1 && n.line[1].home === 0, 'tennis match won');
}

// ---- scoreDelta
{
  const g = scores.createDemoGame('football', { now: NOW, startedMinutesAgo: 6 });
  eq(scores.scoreDelta(undefined, g), { home: 0, away: 0 });
  eq(scores.scoreDelta(g, g), { home: 0, away: 0 });
  eq(scores.scoreDelta(g, scores.applyScore(g, 'away', 3, NOW)), { home: 0, away: 3 });
  eq(scores.scoreDelta(scores.applyScore(g, 'away', 3, NOW), g), { home: 0, away: 0 }, 'lower score is 0');
  const v = scores.createDemoGame('wvb', { now: NOW, startedMinutesAgo: 0 });
  eq(scores.scoreDelta(v, scores.applyScore(v, 'away', 1, NOW)), { home: 0, away: 1 }, 'volleyball point counts +1');
}


// ---- the schedule parser
const provider = compile('src/lib/scoresProvider.ts', { zod, './sports': sports, './scores': scores }, { fetch: () => Promise.reject(new Error('offline')), AbortSignal, Intl });
const ICS = [
  'BEGIN:VCALENDAR', 'VERSION:2.0',
  'BEGIN:VEVENT', 'DTSTART:20261115T030000Z', 'DTEND:20261115T050000Z', 'LOCATION:Los Angeles\\, Calif., Galen Center',
  "SUMMARY:USC Trojans Women's Volleyball vs Washington - Senior Day",
  "DESCRIPTION:USC Trojans Women's Volleyball vs Washington - Senior Day\\nTV: Big Ten Network\\nStreaming Video: https://bigten.org/btn/watch-live/\\nTickets: https://usctrojans.evenue.net/event/VB26/VW14\\n",
  'URL:https://admin.usctrojans.com/calendar.aspx?game_id=35385&amp;sport_id=21', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART:20261108T200000Z', 'DTEND:20261108T230000Z', 'LOCATION:Bloomington\\, Ind., Memorial Stadium',
  'SUMMARY:[L] USC Trojans Football at Indiana',
  'DESCRIPTION:[L] USC Trojans Football at Indiana\\nL 13-27\\nLive Stats: https://example.com/stats\\n',
  'URL:https://admin.usctrojans.com/calendar.aspx?game_id=35001&amp;sport_id=1', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20270609', 'DTEND;VALUE=DATE:20270612', 'LOCATION:Alpharetta\\, Ga.',
  "SUMMARY:USC Trojans Men's Golf  Big Ten Championship", 'DESCRIPTION:x', 'END:VEVENT',
  'BEGIN:VEVENT', 'DTSTART:20261120T180000Z', 'LOCATION:Los Angeles\\, Calif.',
  "SUMMARY:USC Trojans Men's Basket", 'ball vs Oregon', 'END:VEVENT', // folded below
  'BEGIN:VEVENT', 'DTSTART:20261121T180000Z', 'LOCATION:Los Angeles\\, Calif.', 'SUMMARY:USC Trojans Rowing vs Cal', 'END:VEVENT',
  'END:VCALENDAR',
];
// fold the "Basketball" line: the long line is cut and the rest starts with a space
const lines = ICS.join('\r\n').replace("SUMMARY:USC Trojans Men's Basket\r\nball vs Oregon", "SUMMARY:USC Trojans Men's Basket\r\n ball vs Oregon").split('\r\n');
const items = provider.parseIcs(lines.join('\r\n'));
eq(items.length, 5, 'five events parsed');
const [vb, fb, golf, folded, rowing] = items;
ok(vb.sport === 'wvb' && vb.home && vb.opponent === 'Washington' && vb.venueId === 'galen' && vb.result === null, 'home game');
ok(vb.start === '2026-11-15T03:00:00.000Z' && vb.end === '2026-11-15T05:00:00.000Z' && !vb.allDay, 'times');
ok(vb.links.tickets.includes('evenue.net') && vb.links.watch.includes('bigten.org') && vb.links.page.includes('game_id=35385&sport_id=21'), 'links');
ok(vb.location === 'Los Angeles, Calif., Galen Center', 'location unescaped');
ok(fb.sport === 'football' && !fb.home && fb.opponent === 'Indiana' && fb.result === 'L 13-27' && fb.venueId === null && fb.links.stats, 'away game with a result');
ok(golf.sport === 'mgolf' && golf.allDay && golf.venueId === null && golf.start.startsWith('2027-06-09T0'), 'all-day golf');
ok(folded.sport === 'mbb' && folded.opponent === 'Oregon' && folded.home && folded.venueId === 'galen', 'folded line, home by "Los Angeles"');
ok(rowing.sport === null && rowing.sportLabel === 'Rowing' && rowing.opponent === 'Cal', 'unknown sport kept');
for (const bad of ['', 'nope', null, undefined, 42, {}, 'BEGIN:VEVENT\nSUMMARY:x\nEND:VEVENT']) eq(provider.parseIcs(bad), [], 'garbage gives []');

// ---- the ESPN parser: a live volleyball match, sets 1-2
const team = (id, abbreviation, displayName) => ({ id, abbreviation, displayName, color: 'a50010' });
const sample = {
  events: [
    {
      id: '401886068', date: '2026-11-15T03:00Z', shortName: 'WASH @ USC', links: [],
      competitions: [{
        status: { clock: 0, displayClock: '0:00', period: 4, type: { state: 'in', completed: false, detail: '4th Set', shortDetail: '4th Set' } },
        venue: { fullName: 'Galen Center' },
        situation: { lastPlay: { text: 'Kill by Smith' } },
        competitors: [
          { homeAway: 'home', score: '1', team: team('30', 'USC', 'USC Trojans'), linescores: [{ value: 22 }, { value: 25 }, { value: 21 }, { value: 2 }], records: [{ summary: '10-15' }] },
          { homeAway: 'away', score: '2', team: { ...team('264', 'WASH', 'Washington Huskies'), color: '3E3468' }, linescores: [{ value: 25 }, { value: 22 }, { value: 25 }, { value: 3 }], records: [{ summary: '18-6' }] },
        ],
      }],
    },
    { id: '1', date: '2026-11-15T03:00Z', competitions: [{ competitors: [
      { homeAway: 'home', score: '3', team: team('99', 'ABC', 'ABC') }, { homeAway: 'away', score: '0', team: team('98', 'DEF', 'DEF') }] }] },
  ],
};
{
  const r = provider.parseEspnScoreboard(sample, 'wvb');
  eq(r.games.length, 1, 'only the USC match is kept');
  const g = r.games[0];
  ok(g.sport === 'wvb' && g.source === 'espn' && g.sourceLabel === 'Live data · ESPN' && g.state === 'live', 'espn basics');
  ok(g.home.abbr === 'USC' && g.uscSide === 'home' && g.home.score === 1 && g.away.score === 2 && g.home.record === '10-15', 'teams and sets won');
  eq(g.line.map(c => [c.home, c.away]), [[22, 25], [25, 22], [21, 25], [2, 3], [null, null]], 'line table');
  ok(g.statusText === 'Set 4' && g.periodLabel === 'Set 4' && g.lastPlay === 'Kill by Smith', 'status text');
  ok(g.venueId === 'galen' && g.lat === 34.02075 && g.venueName === 'Galen Center', 'venue');
  ok(g.away.color === '#3E3468', 'known colours used');
  const noisy = provider.parseEspnScoreboard({ events: [{ id: 5, date: 'x', competitions: [{ competitors: [{ homeAway: 'home', team: { id: '30', abbreviation: 'USC' } }] }] }] }, 'wvb');
  eq(noisy.games.length, 0, 'bad event skipped');
  ok(noisy.notes.length === 1, 'and noted');
}
for (const bad of [{}, null, undefined, 'x', { events: 'no' }, { events: [null, 3] }, []]) {
  const r = provider.parseEspnScoreboard(bad, 'football');
  eq(r.games, [], 'garbage gives no games');
}
ok(provider.parseEspnScoreboard({}, 'football').notes[0] === 'ESPN football: unexpected shape', 'shape note');
{
  const g = provider.parseEspnScoreboard(sample, 'wvb').games[0];
  eq(provider.parseEspnSummary({ boxscore: {} }, g, 'now'), [], 'summary with no plays');
  eq(provider.parseEspnSummary(null, g, 'now'), [], 'summary garbage');
  const plays = provider.parseEspnSummary({ scoringPlays: [
    { text: 'TD USC', homeScore: 7, awayScore: 0, period: { number: 1 }, clock: { displayValue: '10:12' }, team: { abbreviation: 'USC' } },
    { text: 'FG WASH', homeScore: 7, awayScore: 3, period: { number: 2 }, clock: { displayValue: '2:00' }, team: { abbreviation: 'WASH' } },
  ] }, g, 'now');
  ok(plays.length === 2 && plays[0].text === 'FG WASH' && plays[0].delta === 3 && plays[0].side === 'away' && plays[1].delta === 7, 'summary scoring plays, newest first');
}

// ---- schedule games and the demo fallback
{
  const NOWMS = Date.parse('2026-11-15T04:00:00Z');
  const live = provider.scheduleGame(vb, NOWMS);
  ok(live.state === 'live' && live.source === 'schedule' && live.sourceLabel === 'Schedule · USC Athletics' && live.statusText === 'In progress' && live.home.score === 0, 'schedule game on now');
  const done = provider.scheduleGame(fb, NOWMS);
  ok(done.state === 'final' && done.away.score === 13 && done.home.score === 27 && done.lat === null && done.venueName.includes('Bloomington'), 'schedule game with a result');
  eq(provider.scheduleGame(golf, NOWMS), null, 'all-day golf is list only');
  const d1 = provider.demoGames(NOWMS), d2 = provider.demoGames(NOWMS + 20_000);
  ok(d1.length === 2 && d1.every(g => g.state === 'live' && g.source === 'demo'), 'two live demo games');
  eq(d1.map(g => g.id), d2.map(g => g.id), 'demo ids stay put between polls');
  ok(d1[0].sport === 'football' && d1[0].away.abbr === 'UCLA' && d1[1].sport === 'mbb' && d1[1].away.abbr === 'ORE', 'demo teams');
  for (let m = 0; m < 200; m += 7) ok(provider.demoGames(NOWMS + m * 60_000).every(g => g.state === 'live'), 'demo always in progress');
  const p = await provider.getScores(NOWMS);
  ok(p.games.length >= 2 && p.games.every(g => g.source === 'demo') && p.upcoming.length === 0, 'everything offline: demo games, no throw');
  ok(p.notes.some(n => n.includes('calendar unavailable')), 'offline is noted');
}

console.log(`${checks} checks passed (sports, demo games, scoring rules, schedule and ESPN parsers, offline fallback)`);
