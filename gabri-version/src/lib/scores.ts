/**
 * Live game shapes, the scoring rules for each sport, and a demo simulator.
 * Everything here is pure (no network, no clock reads, no Math.random), so it is safe in the browser.
 * The demo is deterministic: the same game id and the same time always give the same score.
 */
import { SPORTS, VENUES, teamColors, type SportId } from "./sports";

export type GameSource = "espn" | "schedule" | "demo";
export interface TeamSide { abbr: string; name: string; color: string; textColor: string; record?: string; score: number }
/** one column of the period / inning / set table; null = not played yet */
export interface LineColumn { label: string; home: number | null; away: number | null }
export interface ScoringPlay { id: string; side: "home" | "away"; delta: number; text: string; periodLabel: string; clock?: string; at: string; home: number; away: number }
export interface LiveGame {
  id: string; sport: SportId; sportLabel: string;
  venueId: string | null; venueName: string; lat: number | null; lng: number | null;
  start: string; state: "pre" | "live" | "final";
  home: TeamSide; away: TeamSide; uscSide: "home" | "away";
  /** short status for the map bubble: "Q3 8:36", "2H 12:40", "Top 5th", "Set 4", "Final", or the start time for "pre" */
  statusText: string; periodLabel: string; clock: string | null;
  line: LineColumn[];
  /** baseball only: R / H / E */
  totals?: { label: string; home: number; away: number }[];
  lastPlay: string | null;
  /** scoring plays, newest first, at most 8 */
  plays: ScoringPlay[];
  links: { tickets?: string; stats?: string; watch?: string };
  source: GameSource;
  /** "Live data · ESPN" | "Schedule · USC Athletics" | "Demo" */
  sourceLabel: string;
}
export interface ScheduleItem { id: string; sport: SportId | null; sportLabel: string; opponent: string; home: boolean; start: string; end: string | null; allDay: boolean; location: string; venueId: string | null; result: string | null; links: { tickets?: string; stats?: string; watch?: string; page?: string } }
export interface ScoresPayload { games: LiveGame[]; upcoming: ScheduleItem[]; fetchedAt: string; notes: string[] }

type Side = "home" | "away";
const MAX_PLAYS = 8;
/** how many real minutes a whole demo game takes (a "full" game is at most this long) */
export const DEMO_MINUTES = 12;

// ---------- small helpers ----------

/** A small seeded hash: the same (seed, n, salt) always gives the same number from 0 up to 1. */
function rnd(seed: string, n: number, salt = 0): number {
  let x = 2166136261;
  for (let i = 0; i < seed.length; i++) { x ^= seed.charCodeAt(i); x = Math.imul(x, 16777619); }
  x ^= Math.imul(n + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 15), 2246822507);
  x = Math.imul(x ^ (x >>> 13), 3266489909);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
const pick = <T,>(arr: T[], r: number): T => arr[Math.min(arr.length - 1, Math.floor(r * arr.length))];
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const iso = (ms: number) => new Date(ms).toISOString();
const clockText = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
const sideOf = (g: LiveGame, s: Side) => (s === "home" ? g.home : g.away);
const otherSide = (s: Side): Side => (s === "home" ? "away" : "home");
const ordinal = (n: number) => `${n}${["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : Math.min(n % 10, 4) % 4]}`;
/** the last column that has been started (either side has a number) */
function lastIdx(line: LineColumn[]): number {
  for (let i = line.length - 1; i >= 0; i--) if (line[i].home !== null || line[i].away !== null) return i;
  return 0;
}
const bias = (id: string) => 0.85 + 0.3 * rnd(id, 0, 99);
const lastText = (abbr: string, text: string) => (text.includes(abbr) ? text : `${abbr}: ${text}`);

function pushPlay(g: LiveGame, s: Side, delta: number, text: string, atMs: number, home = g.home.score, away = g.away.score) {
  const play: ScoringPlay = {
    id: `${g.id}-${atMs}-${s}-${home}-${away}-${delta}`, side: s, delta, text,
    periodLabel: g.periodLabel, ...(g.clock ? { clock: g.clock } : {}), at: iso(atMs), home, away,
  };
  g.plays = [play, ...g.plays].slice(0, MAX_PLAYS);
  g.lastPlay = lastText(sideOf(g, s).abbr, text);
}

function finish(g: LiveGame) {
  g.state = "final"; g.statusText = "Final"; g.periodLabel = "Final"; g.clock = null;
}

// ---------- formats ----------

const periodName = (name: "Q" | "H", n: number) => (name === "Q" ? `Q${n}` : `${n}H`);
const swimEvents = ["200 Medley Relay", "1000 Free", "200 Free", "100 Back", "100 Breast", "200 Fly", "50 Free", "3-meter Diving"];
const trackEvents = ["100m", "400m", "110m Hurdles", "800m", "Long Jump", "Shot Put", "3000m", "4x400m Relay"];
const golfRounds = ["Round 1", "Round 2", "Round 3"];
const pointEvents = (sport: SportId) => (sport === "mgolf" || sport === "wgolf" ? golfRounds : sport === "track" ? trackEvents : swimEvents);
const isTennis = (sport: SportId) => sport === "mten" || sport === "wten";
const matchLabel = (sport: SportId, idx: number) => (isTennis(sport) ? (idx === 0 ? "Doubles" : `Singles ${idx}`) : `Pair ${idx + 1}`);
const matchColumn = (sport: SportId, idx: number) => (isTennis(sport) ? (idx === 0 ? "D" : String(idx)) : String(idx + 1));
const emptyCols = (labels: string[]): LineColumn[] => labels.map((label) => ({ label, home: null, away: null }));

/** What each timed sport scores: how often (per tick, per side) and what a scoring play looks like. */
const TIMED: Record<string, { tickSec: number; p: number; plays: (abbr: string, a: number, b: number, c: number) => { delta: number; text: string }[] }> = {
  football: {
    tickSec: 30, p: 0.024,
    plays: (abbr, a, b, c) => {
      const yd = 1 + Math.floor(b * 55);
      if (a < 0.55) {
        const td = { delta: 6, text: `Touchdown ${abbr}: ${yd}-yd ${b < 0.5 ? "pass" : "run"}` };
        return c < 0.93 ? [td, { delta: 1, text: `Extra point ${abbr} good` }] : [td];
      }
      if (a < 0.92) return [{ delta: 3, text: `Field goal ${abbr}: ${18 + Math.floor(b * 32)} yds` }];
      return [{ delta: 2, text: `Safety ${abbr}` }];
    },
  },
  hoops: {
    tickSec: 30, p: 0.4,
    plays: (_abbr, a, b) => (a < 0.3 ? [{ delta: 3, text: "3-pointer" }] : a < 0.82 ? [{ delta: 2, text: pick(["Layup", "Jumper", "Dunk"], b) }] : [{ delta: 1, text: "Free throw" }]),
  },
  poloGoal: { tickSec: 30, p: 0.09, plays: () => [{ delta: 1, text: "Goal" }] },
  soccer: { tickSec: 60, p: 0.016, plays: () => [{ delta: 1, text: "Goal" }] },
  lacrosse: { tickSec: 60, p: 0.17, plays: () => [{ delta: 1, text: "Goal" }] },
};
const timedKey = (sport: SportId) =>
  sport === "football" ? "football" : sport === "mbb" || sport === "wbb" ? "hoops" : sport === "wsoc" ? "soccer" : sport === "wlax" ? "lacrosse" : "poloGoal";

/** The text for a forced "+N" play, in that sport's language. */
function forcedText(g: LiveGame, abbr: string, points: number): string {
  const sport = g.sport;
  if (sport === "football") return ({ 1: `Extra point ${abbr} good`, 2: `Safety ${abbr}`, 3: `Field goal ${abbr}`, 6: `Touchdown ${abbr}` } as Record<number, string>)[points] ?? `${abbr} +${points}`;
  if (sport === "mbb" || sport === "wbb") return ({ 1: "Free throw", 2: "Jumper", 3: "3-pointer" } as Record<number, string>)[points] ?? `${abbr} +${points}`;
  if (sport === "baseball") return "Run scores";
  if (SPORTS[sport].format.kind === "points") return `${g.line[lastIdx(g.line)]?.label ?? "Event"}: +${points}`;
  return "Goal";
}

// ---------- create ----------

type DemoOpts = { now: number; opponent?: { abbr: string; name: string }; startedMinutesAgo?: number };

/** A game at the very start: 0-0, first period. */
function blankGame(sport: SportId, opts: DemoOpts): LiveGame {
  const cfg = SPORTS[sport];
  const opp = opts.opponent ?? { abbr: "UCLA", name: "UCLA Bruins" };
  const f = cfg.format;
  // roughly how many real minutes a whole game takes; by default we start it a bit under half way through
  const golf = sport === "mgolf" || sport === "wgolf";
  const natural = f.kind === "points" ? pointEvents(sport).length * (golf ? 1.5 : 0.75) : f.kind === "matches" ? f.total : DEMO_MINUTES;
  const ago = opts.startedMinutesAgo ?? natural * 0.45;
  const startMs = Math.floor((opts.now - ago * 60_000) / 1000) * 1000;
  const venue = cfg.venueId ? VENUES[cfg.venueId] : null;
  const usc = teamColors("USC"), oc = teamColors(opp.abbr);
  let line: LineColumn[];
  let periodLabel = "";
  let clock: string | null = null;
  let totals: LiveGame["totals"];
  if (f.kind === "periods") {
    line = emptyCols(Array.from({ length: f.count }, (_, i) => periodName(f.name, i + 1)));
    line[0].home = 0; line[0].away = 0;
    periodLabel = line[0].label; clock = clockText(f.minutes * 60);
  } else if (f.kind === "innings") {
    line = emptyCols(Array.from({ length: f.count }, (_, i) => String(i + 1)));
    line[0].away = 0;
    periodLabel = "Top 1st";
    totals = [{ label: "R", home: 0, away: 0 }, { label: "H", home: 0, away: 0 }, { label: "E", home: 0, away: 0 }];
  } else if (f.kind === "sets") {
    line = emptyCols(Array.from({ length: f.bestOf }, (_, i) => `Set ${i + 1}`));
    line[0].home = 0; line[0].away = 0;
    periodLabel = "Set 1";
  } else if (f.kind === "matches") {
    line = emptyCols(Array.from({ length: f.total }, (_, i) => matchColumn(sport, i)));
    line[0].home = 0; line[0].away = 0;
    periodLabel = matchLabel(sport, 0);
  } else {
    line = emptyCols(pointEvents(sport));
    line[0].home = 0; line[0].away = 0;
    periodLabel = line[0].label.startsWith("Round") ? line[0].label : "Event 1";
  }
  return {
    id: `demo-${sport}-${opp.abbr}-${startMs}`, sport, sportLabel: cfg.label,
    venueId: venue?.id ?? null, venueName: venue?.name ?? "Off campus", lat: venue?.lat ?? null, lng: venue?.lng ?? null,
    start: iso(startMs), state: "live",
    home: { abbr: "USC", name: "USC Trojans", color: usc.color, textColor: usc.textColor, score: 0 },
    away: { abbr: opp.abbr, name: opp.name, color: oc.color, textColor: oc.textColor, score: 0 },
    uscSide: "home",
    statusText: clock ? `${periodLabel} ${clock}` : periodLabel, periodLabel, clock,
    line, ...(totals ? { totals } : {}),
    lastPlay: null, plays: [], links: {}, source: "demo", sourceLabel: "Demo",
  };
}

export function createDemoGame(sport: SportId, opts: DemoOpts): LiveGame {
  return advanceDemoGame(blankGame(sport, opts), opts.now);
}

// ---------- the simulator ----------

function setWon(f: { bestOf: number; to: number; lastTo: number }, setNo: number, h: number, a: number) {
  const to = setNo === f.bestOf ? f.lastTo : f.to;
  return Math.max(h, a) >= to && Math.abs(h - a) >= 2;
}

/** One volleyball point. Handles a set (and the match) being won. */
function volleyPoint(g: LiveGame, s: Side, text: string, atMs: number) {
  const f = SPORTS[g.sport].format;
  if (f.kind !== "sets") return;
  const idx = lastIdx(g.line), col = g.line[idx];
  col[s] = (col[s] ?? 0) + 1;
  col[otherSide(s)] = col[otherSide(s)] ?? 0;
  const h = col.home ?? 0, a = col.away ?? 0;
  if (!setWon(f, idx + 1, h, a)) { pushPlay(g, s, 1, text, atMs, h, a); return; }
  sideOf(g, s).score += 1;
  pushPlay(g, s, 1, `Set ${sideOf(g, s).abbr}`, atMs);
  if (sideOf(g, s).score >= Math.ceil(f.bestOf / 2)) { finish(g); return; }
  const next = g.line[idx + 1];
  next.home = 0; next.away = 0;
  g.periodLabel = `Set ${idx + 2}`; g.statusText = g.periodLabel;
}

/** One match (beach volleyball pair, tennis court) finished. */
function matchDone(g: LiveGame, s: Side, atMs: number) {
  const f = SPORTS[g.sport].format;
  if (f.kind !== "matches") return;
  const idx = lastIdx(g.line), col = g.line[idx];
  col[s] = 1; col[otherSide(s)] = 0;
  sideOf(g, s).score += 1;
  pushPlay(g, s, 1, `${matchLabel(g.sport, idx)}: ${sideOf(g, s).abbr} wins`, atMs);
  if (sideOf(g, s).score >= Math.floor(f.total / 2) + 1) { finish(g); return; }
  const next = g.line[idx + 1];
  if (!next) { finish(g); return; }
  next.home = 0; next.away = 0;
  g.periodLabel = matchLabel(g.sport, idx + 1); g.statusText = g.periodLabel;
}

/** Points sports: close the current event with the points each side won, then start the next. */
function eventDone(g: LiveGame, atMs: number, awards: { s: Side; delta: number; text: string }[]) {
  const idx = lastIdx(g.line), col = g.line[idx];
  for (const a of awards) {
    sideOf(g, a.s).score += a.delta;
    col[a.s] = (col[a.s] ?? 0) + a.delta;
    pushPlay(g, a.s, a.delta, a.text, atMs);
  }
  const next = g.line[idx + 1];
  if (!next) { finish(g); return; }
  next.home = 0; next.away = 0;
  g.periodLabel = next.label.startsWith("Round") ? next.label : `Event ${idx + 2}`; g.statusText = g.periodLabel;
}

const PLACES = [9, 4, 3, 2, 1];
const PLACE_NAME: Record<number, string> = { 9: "1st", 4: "2nd", 3: "3rd", 2: "4th", 1: "5th" };

function advanceTimed(g: LiveGame, f: Extract<ReturnType<typeof fmtOf>, { kind: "periods" }>, now: number) {
  const prof = TIMED[timedKey(g.sport)];
  const len = f.minutes * 60, total = f.count * len;
  const speed = total / (DEMO_MINUTES * 60);
  const startMs = +new Date(g.start);
  const target = Math.min(total, Math.max(0, Math.floor(((now - startMs) / 1000) * speed)));
  const num = parseInt(g.periodLabel.replace(/\D/g, ""), 10) || 1;
  const [m, sec] = (g.clock ?? "0:00").split(":").map(Number);
  const cur = (num - 1) * len + (len - (m * 60 + (sec || 0)));
  if (target <= cur) return;
  const b = bias(g.id);
  const open = (per: number) => { for (let i = 0; i < per; i++) if (g.line[i].home === null) { g.line[i].home = 0; g.line[i].away = 0; } };
  const label = (per: number, left: number) => { g.periodLabel = periodName(f.name, per); g.clock = clockText(left); g.statusText = `${g.periodLabel} ${g.clock}`; };
  for (let k = Math.floor(cur / prof.tickSec) + 1; k * prof.tickSec <= target; k++) {
    const gs = k * prof.tickSec;
    const per = Math.min(f.count, Math.ceil(gs / len));
    open(per); label(per, per * len - gs);
    const atMs = startMs + Math.round((gs / speed) * 1000);
    for (const s of ["home", "away"] as Side[]) {
      const salt = s === "home" ? 1 : 2;
      if (rnd(g.id, k, salt) >= prof.p * (s === "home" ? b : 2 - b)) continue;
      for (const ev of prof.plays(sideOf(g, s).abbr, rnd(g.id, k, salt + 10), rnd(g.id, k, salt + 20), rnd(g.id, k, salt + 30))) {
        sideOf(g, s).score += ev.delta;
        g.line[per - 1][s] = (g.line[per - 1][s] ?? 0) + ev.delta;
        pushPlay(g, s, ev.delta, ev.text, atMs);
      }
    }
  }
  if (target >= total) { open(f.count); finish(g); return; }
  const per = Math.floor(target / len) + 1;
  open(per); label(per, per * len - target);
}

const fmtOf = (sport: SportId) => SPORTS[sport].format;

/** Moves a demo game on to `now`: the clock runs and teams score now and then. Returns a new object. */
export function advanceDemoGame(game: LiveGame, now: number): LiveGame {
  if (game.state !== "live") return game;
  const g = clone(game);
  const f = fmtOf(g.sport);
  const startMs = +new Date(g.start);
  const elapsed = Math.max(0, now - startMs);
  const b = bias(g.id);
  if (f.kind === "periods") {
    advanceTimed(g, f, now);
  } else if (f.kind === "sets") {
    const want = Math.floor(elapsed / 8000);
    const played = () => g.line.reduce((n, c) => n + (c.home ?? 0) + (c.away ?? 0), 0);
    while (g.state === "live" && played() < want) {
      const n = played();
      const s: Side = rnd(g.id, n, 1) < 0.5 * b + 0.25 ? "home" : "away";
      volleyPoint(g, s, pick(["Kill", "Ace", "Block", "Kill", "Attack error", "Service error"], rnd(g.id, n, 2)), startMs + (n + 1) * 8000);
    }
  } else if (f.kind === "innings") {
    const HALF = 40_000;
    const want = Math.floor(elapsed / HALF);
    const toHalf = () => { const inn = parseInt(g.periodLabel.replace(/\D/g, ""), 10) || 1; return (inn - 1) * 2 + (g.periodLabel.startsWith("Bot") ? 1 : 0); };
    while (g.state === "live" && toHalf() < want) {
      const h = toHalf(), inn = Math.floor(h / 2) + 1, top = h % 2 === 0;
      const bat: Side = top ? "away" : "home", fld = otherSide(bat);
      const r = rnd(g.id, h, 1);
      const runs = r < 0.68 ? 0 : r < 0.88 ? 1 : r < 0.96 ? 2 : r < 0.99 ? 3 : 4;
      const hits = Math.floor(rnd(g.id, h, 2) * 3) + (runs > 0 ? 1 : 0);
      const tot = g.totals!;
      tot[1][bat] += hits;
      if (rnd(g.id, h, 3) < 0.08) tot[2][fld] += 1;
      const col = g.line[inn - 1];
      col[bat] = runs;
      const atMs = startMs + (h + 1) * HALF;
      if (runs > 0) {
        sideOf(g, bat).score += runs; tot[0][bat] += runs;
        pushPlay(g, bat, runs, ["", "RBI single", "2-run double", "3-run homer", "Grand slam"][runs], atMs);
      }
      if (!top && inn >= f.count && g.home.score !== g.away.score) { finish(g); break; }
      const nh = h + 1, ninn = Math.floor(nh / 2) + 1;
      if (ninn > g.line.length) g.line.push({ label: String(ninn), home: null, away: null });
      g.line[ninn - 1][nh % 2 === 0 ? "away" : "home"] = 0;
      g.periodLabel = `${nh % 2 === 0 ? "Top" : "Bot"} ${ordinal(ninn)}`; g.statusText = g.periodLabel;
    }
  } else if (f.kind === "matches") {
    const want = Math.floor(elapsed / 60_000);
    const decided = () => g.line.reduce((n, c) => n + (c.home ?? 0) + (c.away ?? 0), 0);
    while (g.state === "live" && decided() < want) {
      const n = decided();
      matchDone(g, rnd(g.id, n, 1) < 0.5 * b + 0.25 ? "home" : "away", startMs + (n + 1) * 60_000);
    }
  } else {
    const golf = g.sport === "mgolf" || g.sport === "wgolf";
    const STEP = golf ? 90_000 : 45_000;
    const want = Math.floor(elapsed / STEP);
    while (g.state === "live" && lastIdx(g.line) < want) {
      const n = lastIdx(g.line), at = startMs + (n + 1) * STEP;
      const awards: { s: Side; delta: number; text: string }[] = [];
      if (golf) {
        const s: Side = rnd(g.id, n, 1) < 0.5 * b + 0.25 ? "home" : "away";
        const d = pick(SPORTS[g.sport].increments, rnd(g.id, n, 2));
        awards.push({ s, delta: d, text: `${g.line[n].label}: ${sideOf(g, s).abbr} +${d}` });
      } else {
        const won: Record<Side, number[]> = { home: [], away: [] };
        PLACES.forEach((p, i) => won[rnd(g.id, n, 10 + i) < 0.5 * b + 0.25 ? "home" : "away"].push(p));
        for (const s of ["home", "away"] as Side[]) {
          if (!won[s].length) continue;
          awards.push({ s, delta: won[s].reduce((x, y) => x + y, 0), text: `${g.line[n].label}: ${won[s].map((p) => PLACE_NAME[p]).join(" and ")}` });
        }
      }
      eventDone(g, at, awards);
    }
  }
  return g;
}

/** Forces one scoring play (the "+N" button). Anything the sport's rules do not allow leaves the game unchanged. */
export function applyScore(game: LiveGame, side: Side, points: number, now: number): LiveGame {
  if (game.state !== "live" || !SPORTS[game.sport].increments.includes(points)) return game;
  const g = clone(game);
  const f = fmtOf(g.sport);
  const abbr = sideOf(g, side).abbr;
  if (f.kind === "sets") { volleyPoint(g, side, "Kill", now); return g; }
  if (f.kind === "matches") { matchDone(g, side, now); return g; }
  const idx = lastIdx(g.line), col = g.line[idx];
  col[side] = (col[side] ?? 0) + points;
  if (f.kind === "periods" || f.kind === "points") col[otherSide(side)] = col[otherSide(side)] ?? 0;
  sideOf(g, side).score += points;
  if (g.totals) g.totals[0][side] += points;
  pushPlay(g, side, points, forcedText(g, abbr, points), now);
  return g;
}

/** How much each side's main score went up since the last look (0 if it dropped or there is no earlier game). */
export function scoreDelta(prev: LiveGame | undefined, next: LiveGame): { home: number; away: number } {
  if (!prev) return { home: 0, away: 0 };
  const d = (a: number, b: number) => Math.max(0, b - a);
  const out = { home: d(prev.home.score, next.home.score), away: d(prev.away.score, next.away.score) };
  if (next.sport === "wvb" || next.sport === "mvb") {
    // a point inside the current set counts as +1
    const i = lastIdx(next.line);
    if (i === lastIdx(prev.line)) {
      for (const s of ["home", "away"] as Side[]) {
        if (out[s] === 0 && (next.line[i][s] ?? 0) > (prev.line[i][s] ?? 0)) out[s] = 1;
      }
    }
  }
  return out;
}
