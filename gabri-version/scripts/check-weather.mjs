// Run with: node scripts/check-weather.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as zod from 'zod';
function compile(file, imports, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { exports, require: name => { if (imports[name]) return imports[name]; throw new Error('Unexpected import: ' + name); }, ...globals }, { filename: file });
  return exports;
}
const weather = compile('src/lib/weather.ts', { zod });
const response = { current: { temperature_2m: 71.6, weather_code: 61, is_day: 0 }, daily: { temperature_2m_max: [75.5], temperature_2m_min: [57.8] } };
const parsed = weather.parseWeather(response);
assert.equal(parsed.temperature, 72);
assert.equal(parsed.high, 76);
assert.equal(parsed.low, 58);
assert.equal(parsed.isDay, false);
assert.equal(weather.weatherMode(parsed), 'rain', 'night rain keeps precipitation while lighting stays dark');
assert.throws(() => weather.parseWeather({ ...response, daily: { temperature_2m_max: [], temperature_2m_min: [] } }));
assert.throws(() => weather.parseWeather({ ...response, current: { ...response.current, temperature_2m: null } }));
for (const mode of ['sun', 'clouds', 'rain', 'night']) assert.equal(weather.weatherMode(weather.WEATHER_DEMOS[mode]), mode);

function mount(mode, { reduced = false, hidden = false, active = true } = {}) {
  const frames = new Map(), events = new Map(), changes = new Map();
  let cleanup, id = 0;
  const ctx = new Proxy({}, { get: () => () => {}, set: () => true });
  const canvas = { getContext: () => ctx, getBoundingClientRect: () => ({ width: 1440, height: 900 }) };
  const media = { matches: reduced, addEventListener: (key, fn) => changes.set(key, fn), removeEventListener: key => changes.delete(key) };
  const document = { hidden, addEventListener: (key, fn) => events.set(key, fn), removeEventListener: key => events.delete(key) };
  const component = compile('src/components/weather/WeatherEffects.tsx', {
    react: { useRef: () => ({ current: canvas }), useEffect: fn => { cleanup = fn(); } },
    'react/jsx-runtime': { jsx: () => null },
    '@/lib/weather': weather,
  }, {
    window: { matchMedia: () => media, devicePixelRatio: 2 }, document,
    ResizeObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: fn => { frames.set(++id, fn); return id; }, cancelAnimationFrame: key => frames.delete(key),
  });
  component.default({ weather: weather.WEATHER_DEMOS[mode], active });
  return { frames, events, changes, media, document, cleanup: () => cleanup?.() };
}
for (const mode of ['sun', 'clouds', 'rain', 'night']) {
  const h = mount(mode, { reduced: true });
  assert.equal(h.frames.size, 0, `${mode}: reduced motion never schedules animation`);
  h.cleanup(); assert.equal(h.events.size, 0); assert.equal(h.changes.size, 0);
}
for (const mode of ['sun', 'night']) { const h = mount(mode); assert.equal(h.frames.size, 0); h.cleanup(); }
for (const mode of ['clouds', 'rain']) {
  const h = mount(mode); assert.equal(h.frames.size, 1);
  h.document.hidden = true; h.events.get('visibilitychange')(); assert.equal(h.frames.size, 0);
  h.document.hidden = false; h.events.get('visibilitychange')(); assert.equal(h.frames.size, 1);
  h.media.matches = true; h.changes.get('change')(); assert.equal(h.frames.size, 0);
  h.cleanup(); assert.equal(h.events.size, 0);
}
const inactive = mount('rain', { active: false }); assert.equal(inactive.frames.size, 0); assert.equal(inactive.events.size, 0);
console.log('Weather checks passed: API validation, four states, night rain, reduced motion, hidden-tab pause, cleanup.');
