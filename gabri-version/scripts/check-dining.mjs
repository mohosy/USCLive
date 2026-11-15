// Run with: node scripts/check-dining.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as zod from 'zod';
function compile(file, imports) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { exports, Intl, require: name => { if (imports[name]) return imports[name]; throw new Error('Unexpected import: ' + name); } }, { filename: file });
  return exports;
}
const d = compile('src/lib/dining.ts', { zod });
let n = 0;
const ok = (fn) => { fn(); n++; };
const plain = (x) => JSON.parse(JSON.stringify(x));
const LA = (iso) => new Date(iso).getTime(); // helper: iso with offset

// ---- parseMenu ----
const item = (item, allergens = [], preferences = []) => ({ item, dietary_preferences: [], allergens, preferences });
const fixture = { date: '20261114', location: 'everybodys-kitchen', meals: [
  { name: 'Breakfast' },
  { name: 'Brunch', stations: [
    { station: 'Hot Line', subtitle: '', menu: [
      item('MADE TO ORDER OMELETTES AVAILABLE UNTIL 1PM'),
      item('Scrambled Eggs', ['eggs'], ['halal-ingredients', 'vegetarian']),
      item('Waffles', ['dairy', 'eggs', 'soy', 'gluten'], ['vegetarian']),
      item('Tofu Scramble', ['soy'], ['vegan']),
      item('Mystery Stew', ['not-analyzed']),
      item('Plain Rice', [], ['vegan']),
      item('Tree Nut Bar', ['tree-nuts', 'not-analyzed'], []),
      item('Mystery Plate'),
    ] },
    { station: 'Fresh from the Farm', subtitle: 'Salads', menu: [item('Garden Salad', [], ['vegan'])] },
    { station: 'Hot Line', menu: [item('Late Chili', ['gluten'])] },
  ] },
  { name: 'Lunch' },
  { name: 'Dinner', stations: [{ station: 'Grill', subtitle: '', menu: [item('Burger', ['gluten'])] }, { station: 'Empty', menu: [] }] },
] };
ok(() => {
  const meals = d.parseMenu(fixture);
  assert.deepEqual(plain(meals.map(m => m.id)), ['brunch', 'dinner'], 'meals with no stations are dropped');
  const brunch = meals[0];
  assert.deepEqual(plain(brunch.stations.map(s => s.name)), ['Hot Line', 'Fresh from the Farm', 'Hot Line'], 'duplicate station name kept twice');
  assert.equal(brunch.stations[1].subtitle, 'Salads');
  assert.equal(brunch.stations[0].subtitle, undefined);
  assert.equal(meals[1].stations.length, 1, 'empty station dropped');
  const by = Object.fromEntries(brunch.stations[0].items.map(i => [i.name, i]));
  assert.equal(by['MADE TO ORDER OMELETTES AVAILABLE UNTIL 1PM'].note, true);
  assert.deepEqual(plain(by['MADE TO ORDER OMELETTES AVAILABLE UNTIL 1PM'].tags), [], 'no information: no gluten-free tag');
  assert.equal(by['Scrambled Eggs'].note, false);
  assert.deepEqual(plain(by['Scrambled Eggs'].tags), ['vegetarian', 'gluten-free', 'halal']);
  assert.deepEqual(plain(by['Tofu Scramble'].tags), ['vegan', 'vegetarian', 'gluten-free'], 'vegan implies vegetarian');
  assert.deepEqual(plain(by['Waffles'].tags), ['vegetarian'], 'gluten listed: not gluten-free');
  assert.deepEqual(plain(by['Waffles'].allergens), ['dairy', 'eggs', 'soy', 'gluten']);
  assert.deepEqual(plain(by['Mystery Stew'].tags), [], 'not-analyzed: not gluten-free');
  assert.deepEqual(plain(by['Mystery Stew'].allergens), [], 'not-analyzed never shown');
  assert.deepEqual(plain(by['Tree Nut Bar'].allergens), ['tree nuts'], 'dash becomes a space');
  assert.deepEqual(plain(by['Tree Nut Bar'].tags), []);
  assert.deepEqual(plain(by['Plain Rice'].tags), ['vegan', 'vegetarian', 'gluten-free'], 'a preference counts as a marker');
  assert.equal(by['Mystery Plate'].note, false, 'not all capitals');
  assert.deepEqual(plain(by['Mystery Plate'].tags), []);
  for (const m of meals) for (const s of m.stations) for (const i of s.items) assert.ok(!i.allergens.includes('not-analyzed'));
});
ok(() => {
  for (const bad of [null, undefined, 42, 'x', [], {}, { meals: 'no' }, { meals: [{ name: 5 }] }, { meals: [{ name: 'Lunch', stations: [{ station: 'A', menu: [{ item: 3 }] }] }] },
    { meals: [{ name: 'Breakfast' }, { name: 'Lunch' }] }, { meals: [{ name: 'Lunch', stations: [{ station: 'A', menu: [] }] }] }, { meals: [{ name: 'Lunch', stations: [] }] }]) {
    assert.equal(d.parseMenu(bad), null);
  }
});

// ---- parseHours ----
const NOW = LA('2026-11-14T12:00:00-08:00');
const span = (loc, shifts) => `<div><span class="open-indicator" data-location="${loc}" data-shifts="${shifts}"></span></div>`;
const page = span('405', '[[&quot;1794673800000&quot;,&quot;1794722400000&quot;]]') + span('406', '[]') + span('407', '[[&quot;1794673800000&quot;,&quot;1794690000000&quot;],[&quot;1794700000000&quot;,&quot;1794722400000&quot;]]');
ok(() => {
  assert.deepEqual(plain(d.parseHours(page, '405', NOW)), [{ open: 1794673800000, close: 1794722400000 }]);
  assert.deepEqual(plain(d.parseHours(page, '406', NOW)), []);
  assert.equal(d.parseHours(page, '407', NOW).length, 2);
  assert.equal(d.parseHours(page, '999', NOW), null, 'span missing');
  assert.equal(d.parseHours('<html></html>', '405', NOW), null);
  assert.equal(d.parseHours(span('405', 'not json'), '405', NOW), null);
  assert.equal(d.parseHours(span('405', '[[1]]'), '405', NOW), null);
  assert.equal(d.parseHours(page, '405', NOW + 3 * 86400000), null, 'times from another day are not trusted');
});

// ---- hoursFor ----
const at = (t) => LA(`2026-11-14T${t}:00-08:00`); // Saturday
const shift = [{ open: at('08:30'), close: at('22:00') }];
ok(() => {
  let h = d.hoursFor('evk', '2026-11-14', at('12:00'), shift);
  assert.equal(h.label, 'Open now · closes 10 PM'); assert.equal(h.openNow, true); assert.equal(h.source, 'usc');
  h = d.hoursFor('evk', '2026-11-14', at('06:00'), shift);
  assert.equal(h.label, 'Closed · opens 8:30 AM'); assert.equal(h.openNow, false);
  h = d.hoursFor('evk', '2026-11-14', at('23:00'), shift);
  assert.equal(h.label, 'Closed · opens 8:30 AM tomorrow', 'after closing: Sunday usual opening'); assert.equal(h.openNow, false);
  h = d.hoursFor('evk', '2026-11-16', LA('2026-11-16T23:00:00-08:00'), null); // Monday night
  assert.equal(h.label, 'Closed · opens 7 AM tomorrow');
  h = d.hoursFor('village', '2026-11-14', at('23:00'), null); // Saturday night, Village opens 11 on Sunday
  assert.equal(h.label, 'Closed · opens 11 AM tomorrow');
  h = d.hoursFor('evk', '2026-11-14', at('12:00'), []);
  assert.equal(h.label, 'Closed today'); assert.equal(h.open, null); assert.equal(h.close, null);
  h = d.hoursFor('evk', '2026-11-14', at('12:00'), null);
  assert.equal(h.source, 'usual'); assert.equal(h.label, 'Open now · closes 10 PM', 'Saturday usual hours');
  h = d.hoursFor('evk', '2026-11-16', at('12:00'), shift); // Monday
  assert.equal(h.label, 'Closed · opens 7 AM'); assert.equal(h.openNow, false); assert.equal(h.source, 'usual');
  assert.equal(new Date(h.open).toISOString(), '2026-11-16T15:00:00.000Z');
  h = d.hoursFor('village', '2026-11-15', at('12:00'), null); // Sunday
  assert.equal(h.label, 'Closed · opens 11 AM');
  h = d.hoursFor('parkside', '2026-11-19', at('12:00'), null); // Thursday, EVK closes at 8 but Parkside 10
  assert.equal(h.label, 'Closed · opens 7 AM');
  h = d.hoursFor('evk', '2026-11-20', at('12:00'), null);
  assert.equal(new Date(h.close).toISOString(), '2026-11-21T06:00:00.000Z', 'Friday 10 PM PST');
  h = d.hoursFor('evk', '2026-11-13', at('12:00'), null);
  assert.equal(h.openNow, false);
  h = d.hoursFor('evk', '2026-11-14', at('12:00'), [{ open: at('07:00'), close: at('10:00') }, { open: at('11:00'), close: at('13:30') }]);
  assert.equal(h.label, 'Open now · closes 1:30 PM');
  h = d.hoursFor('evk', '2026-11-14', at('10:30'), [{ open: at('07:00'), close: at('10:00') }, { open: at('11:00'), close: at('13:30') }]);
  assert.equal(h.label, 'Closed · opens 11 AM');
  // daylight saving: a summer date still reads in local time
  h = d.hoursFor('evk', '2026-07-15', LA('2026-07-15T12:00:00-07:00'), null);
  assert.equal(h.label, 'Open now · closes 10 PM');
});

// ---- currentMealFor ----
ok(() => {
  const weekday = d.demoMenu('evk', '2026-11-16'); // breakfast, lunch, dinner
  const day = '2026-11-16';
  const t = (hhmm) => LA(`${day}T${hhmm}:00-08:00`);
  assert.equal(d.currentMealFor(weekday, t('09:00'), day), 'breakfast');
  assert.equal(d.currentMealFor(weekday, t('13:00'), day), 'lunch');
  assert.equal(d.currentMealFor(weekday, t('18:00'), day), 'dinner');
  assert.equal(d.currentMealFor(weekday, t('23:00'), day), 'dinner', 'after the last meal: the last one');
  assert.equal(d.currentMealFor(weekday, t('05:00'), day), 'breakfast', 'before the first meal: the next one');
  assert.equal(d.currentMealFor(weekday, t('15:30'), day), 'dinner', 'between meals: the next one');
  assert.equal(d.currentMealFor(weekday, t('18:00'), '2026-11-17'), 'breakfast', 'another day: the first meal');
  assert.equal(d.currentMealFor([], t('12:00'), day), null);
});

// ---- demoMenu ----
ok(() => {
  const pasta = /penne|spaghetti|fettuccine|rotini|ziti|pasta/i;
  for (const hall of ['evk', 'parkside', 'village']) {
    for (const [date, ids] of [['2026-11-16', ['breakfast', 'lunch', 'dinner']], ['2026-11-17', ['breakfast', 'lunch', 'dinner']], ['2026-11-21', ['brunch', 'dinner']], ['2026-11-22', ['brunch', 'dinner']]]) {
      const meals = d.demoMenu(hall, date);
      assert.deepEqual(plain(meals.map(m => m.id)), ids, `${hall} ${date} meals`);
      assert.deepEqual(plain(d.demoMenu(hall, date)), plain(meals), 'deterministic');
      const all = [];
      for (const m of meals) {
        assert.ok(m.stations.length >= 2 && m.stations.length <= 4, `${hall} ${m.id} stations`);
        for (const s of m.stations) {
          assert.ok(s.items.length >= 5 && s.items.length <= 8, `${hall} ${s.name} dishes: ${s.items.length}`);
          all.push(...s.items);
        }
      }
      assert.ok(all.some(i => pasta.test(i.name)), `${hall} ${date} pasta`);
      for (const tag of ['vegan', 'vegetarian', 'gluten-free', 'halal']) assert.ok(all.some(i => i.tags.includes(tag)), `${hall} ${date} ${tag}`);
      assert.ok(all.filter(i => i.tags.includes('vegan')).length >= 3);
      for (const i of all) if (i.tags.includes('vegan')) assert.ok(i.tags.includes('vegetarian'));
    }
    assert.notDeepEqual(plain(d.demoMenu(hall, '2026-11-16')), plain(d.demoMenu(hall, '2026-11-17')), 'varies by day');
  }
  const names = d.demoMenu('parkside', '2026-11-16')[2].stations.map(s => s.name);
  assert.ok(names.includes('Americana') && names.includes('Eurasia'));
});

// ---- menuUrl, laDate, halls ----
ok(() => {
  assert.equal(d.menuUrl('evk', '2026-03-05'), 'https://hospitality.usc.edu/wp-json/hsp-api/v1/get-res-dining-menus/evk?y=2026&m=03&d=05');
  assert.equal(d.menuUrl('village', '2026-11-14'), 'https://hospitality.usc.edu/wp-json/hsp-api/v1/get-res-dining-menus/university-village?y=2026&m=11&d=14');
  assert.equal(d.laDate(LA('2026-11-15T07:59:00Z')), '2026-11-14', 'just before midnight in LA');
  assert.equal(d.laDate(LA('2026-11-15T08:00:00Z')), '2026-11-15', 'midnight in LA');
  assert.equal(d.laDate(LA('2026-07-15T06:59:00Z')), '2026-07-14', 'summer time');
  assert.equal(d.laDate(LA('2026-07-15T07:00:00Z')), '2026-07-15');
  assert.deepEqual(['evk', 'parkside', 'village'].map(h => d.DINING_HALLS[h].hoursLocationId), ['405', '406', '407']);
  assert.equal(d.DINING_HALLS.village.slug, 'university-village');
});

console.log(`Dining checks passed: ${n} groups (menu parsing, hours page, hours labels, current meal, demo menu, urls, dates).`);
