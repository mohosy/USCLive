/**
 * Where live games come from.
 *  1. The USC Athletics calendar (every sport): who plays when and where.
 *  2. ESPN's public scoreboard (the sports it covers): live scores, only asked about near a USC game.
 *  3. A demo football and basketball game when nothing is really live, so the feature can still be shown.
 * The parsers are pure and exported (the test script feeds them samples). The fetchers are separate.
 * A source that fails or changes shape adds a short note and is skipped. Nothing here throws.
 */
import { z } from "zod";
import { SPORTS, VENUES, SPORT_IDS, teamColors, type SportId } from "./sports";
import { advanceDemoGame, createDemoGame, DEMO_MINUTES, type LiveGame, type ScheduleItem, type ScoresPayload, type ScoringPlay, type TeamSide } from "./scores";

const ICS_URL = "https://usctrojans.com/calendar.ashx/calendar.ics";
const ESPN = "https://site.api.espn.com/apis/site/v2/sports";
const UA = "USCLive/0.1 (student hackathon project)";
const HOUR = 3600_000;
const TZ = "America/Los_Angeles";

// ---------- time helpers (Los Angeles time) ----------

function laParts(ms: number) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { ymd: `${get("year")}${get("month")}${get("day")}`, hour: Number(get("hour")) };
}
/** "7:30 PM" in Los Angeles time */
const laClock = (ms: number) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(ms));
/** midnight at the start of a calendar day (YYYYMMDD) in Los Angeles, as an ISO string */
function laMidnight(ymd: string): string {
  const base = Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)), 8);
  // 08:00 UTC is midnight in winter and 1 AM in summer
  return new Date(laParts(base).hour === 0 ? base : base - HOUR).toISOString();
}

// ---------- calendar (ICS) ----------

const IcsEvent = z.object({
  start: z.string().regex(/^\d{8}(T\d{6}Z?)?$/),
  summary: z.string().min(1),
});

const unescapeIcs = (s: string) => s.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");
function icsDate(raw: string, allDay: boolean): string {
  if (allDay || !raw.includes("T")) return laMidnight(raw.slice(0, 8));
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return "";
  // a time without a Z is Los Angeles time; the USC calendar sends Z, so this is only a fallback
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  if (m[7]) return new Date(asUtc).toISOString();
  const winter = asUtc + 8 * HOUR;
  return new Date(laParts(winter).hour === +m[4] ? winter : winter - HOUR).toISOString();
}

/** Words in a calendar location that name one of our venues. */
const VENUE_WORDS: [string, RegExp][] = [
  ["coliseum", /coliseum/i], ["galen", /galen/i], ["uytengsu", /uytengsu/i], ["dedeaux", /dedeaux/i],
  ["mcalister", /mcalister/i], ["merle", /merle norman|norman stadium/i], ["marks", /marks/i], ["loker", /loker|allyson felix/i],
];
const venueIdIn = (text: string) => VENUE_WORDS.find(([, re]) => re.test(text))?.[0] ?? null;

/** A home game: the calendar names our venue, or it just says Los Angeles with no stadium named. */
export function venueFromLocation(location: string, home: boolean, sport: SportId | null): string | null {
  const named = venueIdIn(location);
  if (named) return named;
  const rest = location.replace(/^\s*Los Angeles\s*,\s*Calif[a-z.]*\s*,?\s*/i, "").trim();
  if (home && /^Los Angeles/i.test(location) && !rest && sport) return SPORTS[sport].venueId;
  return null;
}

const SPORTS_BY_NAME_LENGTH = [...SPORT_IDS].sort((a, b) => SPORTS[b].icsName.length - SPORTS[a].icsName.length);

/** Reads the USC athletics calendar text. Bad events are skipped; bad input gives an empty list. */
export function parseIcs(text: unknown): ScheduleItem[] {
  if (typeof text !== "string" || !text.includes("BEGIN:VEVENT")) return [];
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const items: ScheduleItem[] = [];
  for (const block of unfolded.split("BEGIN:VEVENT").slice(1)) {
    try {
      const body = block.split("END:VEVENT")[0];
      const props = new Map<string, { value: string; params: string }>();
      for (const line of body.split(/\r?\n/)) {
        const m = line.match(/^([A-Z-]+)((?:;[^:]*)?):(.*)$/);
        if (m && !props.has(m[1])) props.set(m[1], { value: m[3], params: m[2] });
      }
      const dtstart = props.get("DTSTART"), dtend = props.get("DTEND");
      const raw = IcsEvent.safeParse({ start: dtstart?.value.trim(), summary: props.get("SUMMARY") ? unescapeIcs(props.get("SUMMARY")!.value).trim() : undefined });
      if (!raw.success) continue;
      const allDay = /VALUE=DATE/i.test(dtstart!.params) || !raw.data.start.includes("T");
      const start = icsDate(raw.data.start, allDay);
      if (!start) continue;
      const end = dtend && /^\d{8}(T\d{6}Z?)?$/.test(dtend.value.trim()) ? icsDate(dtend.value.trim(), allDay) || null : null;

      // "[L] USC Trojans Football at Indiana": drop the [L], find the sport, then vs / at and the opponent
      const title = raw.data.summary.replace(/^\[[A-Z]\]\s*/, "").replace(/^USC Trojans\s+/i, "");
      const sport = SPORTS_BY_NAME_LENGTH.find((id) => title.startsWith(SPORTS[id].icsName) && /^\s|^$/.test(title.slice(SPORTS[id].icsName.length))) ?? null;
      const vsAt = title.match(/^(.*?)\s+(vs|at)\s+(.*)$/i);
      const sportLabel = sport ? SPORTS[sport].label : (vsAt ? vsAt[1] : title).trim();
      let opponent = "";
      let home = false;
      if (sport && vsAt && vsAt[1].trim() === SPORTS[sport].icsName) { home = vsAt[2].toLowerCase() === "vs"; opponent = vsAt[3]; }
      else if (sport) opponent = title.slice(SPORTS[sport].icsName.length);
      else if (vsAt) { home = vsAt[2].toLowerCase() === "vs"; opponent = vsAt[3]; }
      else opponent = title;
      opponent = opponent.replace(/\s+[-–]\s+.*$/, "").replace(/\s+/g, " ").trim();

      const location = unescapeIcs(props.get("LOCATION")?.value ?? "").replace(/\s+,/g, ",").replace(/\s+/g, " ").trim();
      const desc = unescapeIcs(props.get("DESCRIPTION")?.value ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
      const grab = (re: RegExp) => { for (const l of desc) { const m = l.match(re); if (m) return m[1]; } return undefined; };
      const result = desc.slice(1).find((l) => /^[WLT]\s+\d+\s*[-–]\s*\d+/.test(l) || /^T?-?\d+(st|nd|rd|th)\b/.test(l)) ?? null;
      const url = props.get("URL")?.value.replace(/&amp;/g, "&").trim();
      const gameId = url?.match(/game_id=(\d+)/)?.[1];
      const links: ScheduleItem["links"] = {};
      const tickets = grab(/^Tickets:\s*(https?:\/\/\S+)/i), stats = grab(/^Live Stats:\s*(https?:\/\/\S+)/i), watch = grab(/^Streaming Video:\s*(https?:\/\/\S+)/i);
      if (tickets) links.tickets = tickets;
      if (stats) links.stats = stats;
      if (watch) links.watch = watch;
      if (url?.startsWith("http")) links.page = url;
      items.push({
        id: `ics-${gameId ?? props.get("UID")?.value ?? `${start}-${items.length}`}`,
        sport, sportLabel, opponent, home, start, end, allDay, location,
        venueId: venueFromLocation(location, home, sport), result, links,
      });
    } catch {
      // one broken event never spoils the rest
    }
  }
  return items;
}

// ---------- ESPN ----------

const Num = z.union([z.number(), z.string()]);
const EspnCompetitor = z.object({
  homeAway: z.enum(["home", "away"]),
  score: Num.optional(),
  team: z.object({
    id: Num, abbreviation: z.string().optional(), displayName: z.string().optional(), shortDisplayName: z.string().optional(), color: z.string().optional(),
  }),
  linescores: z.array(z.object({ value: z.number().optional(), displayValue: z.string().optional() })).optional(),
  records: z.array(z.object({ summary: z.string().optional(), type: z.string().optional() })).optional(),
  hits: Num.optional(), errors: Num.optional(),
});
const EspnStatus = z.object({
  clock: z.number().optional(), displayClock: z.string().optional(), period: z.number().optional(),
  type: z.object({ state: z.enum(["pre", "in", "post"]), completed: z.boolean().optional(), detail: z.string().optional(), shortDetail: z.string().optional() }),
});
const EspnEvent = z.object({
  id: Num, date: z.string(), shortName: z.string().optional(),
  links: z.array(z.object({ href: z.string().optional(), rel: z.array(z.string()).optional() })).optional(),
  status: EspnStatus.optional(),
  competitions: z.array(z.object({
    status: EspnStatus.optional(),
    neutralSite: z.boolean().optional(),
    competitors: z.array(EspnCompetitor).min(2),
    venue: z.object({ fullName: z.string().optional() }).optional(),
    situation: z.object({ lastPlay: z.object({ text: z.string().optional() }).optional() }).optional(),
  })).min(1),
});

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const hexOk = (c?: string) => !!c && /^[0-9a-f]{6}$/i.test(c);
const periodText = (sport: SportId, n: number) => {
  const f = SPORTS[sport].format;
  if (f.kind === "periods") return n > f.count ? "OT" : f.name === "Q" ? `Q${n}` : `${n}H`;
  if (f.kind === "sets") return `Set ${n}`;
  return String(n);
};

/** An ESPN team: our colour table first, then ESPN's colour with a readable text colour. */
function espnSide(c: z.infer<typeof EspnCompetitor>): TeamSide {
  const abbr = c.team.abbreviation ?? c.team.shortDisplayName ?? "TBD";
  const known = teamColors(abbr);
  let { color, textColor } = known;
  if (known.color === "#3a3a3c" && hexOk(c.team.color)) {
    color = `#${c.team.color}`;
    const r = parseInt(c.team.color!.slice(0, 2), 16), g = parseInt(c.team.color!.slice(2, 4), 16), b = parseInt(c.team.color!.slice(4, 6), 16);
    textColor = 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#000000" : "#ffffff";
  }
  const rec = c.records?.find((r) => r.type === "total") ?? c.records?.[0];
  return { abbr, name: c.team.displayName ?? abbr, color, textColor, ...(rec?.summary ? { record: rec.summary } : {}), score: num(c.score) };
}

/** Turns an ESPN scoreboard into USC games. Anything odd is skipped and noted. Never throws. */
export function parseEspnScoreboard(json: unknown, sport: SportId): { games: LiveGame[]; notes: string[] } {
  const cfg = SPORTS[sport];
  const label = `ESPN ${sport === "football" ? "football" : cfg.label.toLowerCase()}`;
  const top = z.object({ events: z.array(z.unknown()) }).safeParse(json);
  if (!top.success || !cfg.espn) return { games: [], notes: [`${label}: unexpected shape`] };
  const games: LiveGame[] = [];
  let skipped = 0;
  for (const raw of top.data.events) {
    const ev = EspnEvent.safeParse(raw);
    if (!ev.success) { if (JSON.stringify(raw).includes('"USC"')) skipped++; continue; }
    const comp = ev.data.competitions[0];
    const usc = comp.competitors.find((c) => c.team.abbreviation === "USC" || String(c.team.id) === cfg.espn!.teamId);
    if (!usc) continue;
    const startMs = Date.parse(ev.data.date);
    const status = comp.status ?? ev.data.status;
    if (!Number.isFinite(startMs) || !status) { skipped++; continue; }
    const home = comp.competitors.find((c) => c.homeAway === "home")!, away = comp.competitors.find((c) => c.homeAway === "away")!;
    if (home === away) { skipped++; continue; }
    const f = cfg.format;
    const state: LiveGame["state"] = status.type.state === "in" ? "live" : status.type.state === "post" ? "final" : "pre";

    // the line table: one column per period / set / inning, null where nothing has been played
    const hs = home.linescores ?? [], as = away.linescores ?? [];
    const cols = Math.max(f.kind === "periods" ? f.count : f.kind === "sets" ? f.bestOf : f.kind === "innings" ? f.count : 0, hs.length, as.length);
    const val = (l: { value?: number; displayValue?: string } | undefined) => (l ? (typeof l.value === "number" ? l.value : l.displayValue !== undefined && l.displayValue !== "" && Number.isFinite(Number(l.displayValue)) ? Number(l.displayValue) : null) : null);
    const line = Array.from({ length: cols }, (_, i) => ({
      label: f.kind === "innings" ? String(i + 1) : f.kind === "periods" && i >= f.count ? (i === f.count ? "OT" : `OT${i - f.count + 1}`) : periodText(sport, i + 1),
      home: val(hs[i]), away: val(as[i]),
    }));

    const period = status.period ?? 0;
    const detail = status.type.shortDetail ?? status.type.detail ?? "";
    let periodLabel = "", clock: string | null = null, statusText = "";
    if (state === "pre") { statusText = laClock(startMs); }
    else if (state === "final") { statusText = "Final"; periodLabel = "Final"; }
    else if (f.kind === "innings") { periodLabel = detail || "In progress"; statusText = periodLabel; }
    else if (/half|end of|delay|postpone/i.test(detail) && !/^\d/.test(detail)) { periodLabel = detail; statusText = detail; }
    else if (f.kind === "sets") { periodLabel = `Set ${period || 1}`; statusText = periodLabel; }
    else {
      periodLabel = period ? periodText(sport, period) : detail || "Live";
      clock = status.displayClock && status.displayClock !== "" ? status.displayClock : null;
      statusText = clock ? `${periodLabel} ${clock}` : periodLabel;
    }

    const homeSide = espnSide(home), awaySide = espnSide(away);
    const uscIsHome = usc === home;
    const venueName = comp.venue?.fullName ?? (uscIsHome && cfg.venueId ? VENUES[cfg.venueId].name : "TBD");
    const venueId = venueIdIn(venueName) ?? (uscIsHome && !comp.neutralSite ? cfg.venueId : null);
    const venue = venueId ? VENUES[venueId] : null;
    const statsLink = ev.data.links?.find((l) => l.rel?.some((r) => ["summary", "boxscore", "gamecast"].includes(r)) && l.href)?.href;
    games.push({
      id: `espn-${sport}-${ev.data.id}`, sport, sportLabel: cfg.label,
      venueId: venue?.id ?? null, venueName, lat: venue?.lat ?? null, lng: venue?.lng ?? null,
      start: new Date(startMs).toISOString(), state,
      home: homeSide, away: awaySide, uscSide: uscIsHome ? "home" : "away",
      statusText, periodLabel, clock, line,
      ...(f.kind === "innings" ? { totals: [
        { label: "R", home: homeSide.score, away: awaySide.score },
        { label: "H", home: num(home.hits), away: num(away.hits) },
        { label: "E", home: num(home.errors), away: num(away.errors) },
      ] } : {}),
      lastPlay: comp.situation?.lastPlay?.text ?? null, plays: [],
      links: statsLink ? { stats: statsLink } : {},
      source: "espn", sourceLabel: "Live data · ESPN",
    });
  }
  return { games, notes: skipped ? [`${label}: ${skipped} game(s) in an unexpected shape`] : [] };
}

const SummaryPlay = z.object({
  text: z.string().optional(),
  awayScore: Num.optional(), homeScore: Num.optional(),
  period: z.object({ number: z.number().optional() }).optional(),
  clock: z.object({ displayValue: z.string().optional() }).optional(),
  team: z.object({ abbreviation: z.string().optional() }).optional(),
  scoringPlay: z.boolean().optional(),
});

/** Scoring plays from an ESPN game summary, newest first (at most 8). Many sports have none: then []. */
export function parseEspnSummary(json: unknown, game: LiveGame, nowIso: string): ScoringPlay[] {
  const top = z.object({ scoringPlays: z.array(z.unknown()).optional(), plays: z.array(z.unknown()).optional() }).safeParse(json);
  if (!top.success) return [];
  const rawList = top.data.scoringPlays?.length ? top.data.scoringPlays : (top.data.plays ?? []).filter((p) => (p as { scoringPlay?: unknown } | null)?.scoringPlay === true);
  const plays: ScoringPlay[] = [];
  let prevH = 0, prevA = 0;
  rawList.forEach((raw, i) => {
    const p = SummaryPlay.safeParse(raw);
    if (!p.success || !p.data.text) return;
    const h = num(p.data.homeScore), a = num(p.data.awayScore);
    const side: "home" | "away" = p.data.team?.abbreviation === game.away.abbr ? "away" : p.data.team?.abbreviation === game.home.abbr ? "home" : h - prevH >= a - prevA ? "home" : "away";
    const delta = Math.max(1, side === "home" ? h - prevH : a - prevA);
    prevH = h; prevA = a;
    plays.push({
      id: `${game.id}-sp${i}`, side, delta, text: p.data.text, periodLabel: periodText(game.sport, p.data.period?.number ?? 1),
      ...(p.data.clock?.displayValue ? { clock: p.data.clock.displayValue } : {}), at: nowIso, home: h, away: a,
    });
  });
  return plays.reverse().slice(0, 8);
}

// ---------- games built from the calendar ----------

const KNOWN_ABBR: Record<string, string> = {
  UCLA: "UCLA", Oregon: "ORE", Washington: "WASH", Stanford: "STAN", "Notre Dame": "ND", California: "CAL", Cal: "CAL",
  Michigan: "MICH", "Ohio State": "OSU", "Penn State": "PSU", Indiana: "IU",
};
function abbrFor(name: string): string {
  const clean = name.replace(/^(No\.|#)\s*\d+\s*/i, "").trim();
  if (KNOWN_ABBR[clean]) return KNOWN_ABBR[clean];
  const words = clean.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words.map((w) => w[0]).join("") : clean.slice(0, 4)).toUpperCase() || "OPP";
}

const itemEnd = (it: ScheduleItem) => (it.end ? Date.parse(it.end) : Date.parse(it.start) + 3 * HOUR);

/** A game the calendar says is on, with no score data. */
export function scheduleGame(it: ScheduleItem, now: number): LiveGame | null {
  if (!it.sport || it.allDay) return null;
  const cfg = SPORTS[it.sport];
  const startMs = Date.parse(it.start);
  const runsTo = Math.max(itemEnd(it), startMs + 3 * HOUR);
  const state: LiveGame["state"] = now < startMs ? "pre" : it.result || now > runsTo ? "final" : "live";
  const abbr = abbrFor(it.opponent), oc = teamColors(abbr), uc = teamColors("USC");
  let usc = 0, opp = 0;
  const m = it.result?.match(/^([WLT])\s+(\d+)\s*[-–]\s*(\d+)/);
  if (state === "final" && m) {
    const hi = Math.max(+m[2], +m[3]), lo = Math.min(+m[2], +m[3]);
    [usc, opp] = m[1] === "W" ? [hi, lo] : m[1] === "L" ? [lo, hi] : [+m[2], +m[3]];
  }
  const uscSide: "home" | "away" = it.home ? "home" : "away";
  const mine: TeamSide = { abbr: "USC", name: "USC Trojans", color: uc.color, textColor: uc.textColor, score: usc };
  const theirs: TeamSide = { abbr, name: it.opponent || abbr, color: oc.color, textColor: oc.textColor, score: opp };
  const venue = it.venueId ? VENUES[it.venueId] : null;
  const text = state === "pre" ? laClock(startMs) : state === "final" ? "Final" : "In progress";
  return {
    id: it.id, sport: it.sport, sportLabel: cfg.label,
    venueId: venue?.id ?? null, venueName: venue?.name ?? (it.location || "TBD"), lat: venue?.lat ?? null, lng: venue?.lng ?? null,
    start: it.start, state,
    home: it.home ? mine : theirs, away: it.home ? theirs : mine, uscSide,
    statusText: text, periodLabel: state === "final" ? "Final" : "", clock: null,
    line: [], lastPlay: null, plays: [],
    links: { ...(it.links.tickets ? { tickets: it.links.tickets } : {}), ...(it.links.stats ? { stats: it.links.stats } : {}), ...(it.links.watch ? { watch: it.links.watch } : {}) },
    source: "schedule", sourceLabel: "Schedule · USC Athletics",
  };
}

// ---------- demo games ----------

/** A football and a basketball game that are always in progress. Same for everyone, changes every few minutes. */
export function demoGames(now: number): LiveGame[] {
  const cycle = DEMO_MINUTES * 60_000;
  const make = (sport: SportId, opp: { abbr: string; name: string }, offsetMin: number) => {
    const off = offsetMin * 60_000;
    const start = Math.floor((now - off) / cycle) * cycle + off;
    return advanceDemoGame(createDemoGame(sport, { now: start, opponent: opp, startedMinutesAgo: 0 }), now);
  };
  return [
    make("football", { abbr: "UCLA", name: "UCLA Bruins" }, 0),
    make("mbb", { abbr: "ORE", name: "Oregon Ducks" }, 4),
  ];
}

// ---------- fetching ----------

async function getText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.text();
}
async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

let scheduleCache: { at: number; items: ScheduleItem[] } | null = null;
/** The parsed calendar, kept in memory for 10 minutes. If the site is down we keep the last good copy. */
export async function loadSchedule(now: number, notes: string[]): Promise<ScheduleItem[]> {
  if (scheduleCache && now - scheduleCache.at < 10 * 60_000) return scheduleCache.items;
  try {
    const items = parseIcs(await getText(ICS_URL));
    if (!items.length) throw new Error("no events found");
    scheduleCache = { at: now, items };
    return items;
  } catch (e) {
    notes.push(`USC Athletics calendar unavailable: ${e instanceof Error ? e.message : "error"}`);
    // try again in a minute instead of hammering the site
    if (scheduleCache) { scheduleCache = { at: now - 9 * 60_000, items: scheduleCache.items }; return scheduleCache.items; }
    scheduleCache = { at: now - 9 * 60_000, items: [] };
    return [];
  }
}

async function loadEspn(sport: SportId, now: number, notes: string[]): Promise<LiveGame[]> {
  const cfg = SPORTS[sport];
  if (!cfg.espn) return [];
  const la = laParts(now);
  const dates = [la.ymd];
  if (la.hour < 3) dates.push(laParts(now - 24 * HOUR).ymd);
  const out: LiveGame[] = [];
  for (const d of dates) {
    try {
      const parsed = parseEspnScoreboard(await getJson(`${ESPN}/${cfg.espn.path}/scoreboard?dates=${d}&limit=400`), sport);
      notes.push(...parsed.notes);
      for (const g of parsed.games) {
        if (out.some((x) => x.id === g.id)) continue;
        if (g.state === "live") {
          try {
            g.plays = parseEspnSummary(await getJson(`${ESPN}/${cfg.espn.path}/summary?event=${g.id.split("-").pop()}`), g, new Date(now).toISOString());
          } catch { /* no play list: fine */ }
        }
        out.push(g);
      }
    } catch (e) {
      notes.push(`ESPN ${cfg.label.toLowerCase()} unavailable: ${e instanceof Error ? e.message : "error"}`);
    }
  }
  return out;
}

/** Works out the games and the next events from the calendar and ESPN. Pure apart from the fetches. */
async function assemble(now: number): Promise<ScoresPayload> {
  const notes: string[] = [];
  const schedule = await loadSchedule(now, notes);
  const games: LiveGame[] = [];

  // ask ESPN only about sports with a USC game within 6 hours either side of now
  const near = new Set<SportId>();
  for (const it of schedule) if (it.sport && !it.allDay && Math.abs(Date.parse(it.start) - now) <= 6 * HOUR) near.add(it.sport);
  const espnSports = [...near].filter((s) => SPORTS[s].espn);
  const espnGames = (await Promise.all(espnSports.map((s) => loadEspn(s, now, notes)))).flat();
  for (const g of espnGames) {
    const s = Date.parse(g.start);
    if (g.state === "live" || (g.state === "pre" && s - now <= 3 * HOUR) || (g.state === "final" && now - s <= 6 * HOUR)) games.push(g);
  }

  // calendar games ESPN does not cover
  for (const it of schedule) {
    if (!it.sport || it.allDay || SPORTS[it.sport].venueId === null) continue;
    const s = Date.parse(it.start);
    if (espnGames.some((g) => g.sport === it.sport && Math.abs(Date.parse(g.start) - s) <= 3 * HOUR)) continue;
    const g = scheduleGame(it, now);
    if (!g) continue;
    const endsAt = Math.max(itemEnd(it), s + 3 * HOUR);
    if (g.state === "pre" ? s - now <= 3 * HOUR : g.state === "live" ? true : now - endsAt <= 3 * HOUR) games.push(g);
  }

  if (!games.some((g) => g.state === "live")) games.push(...demoGames(now));

  const rank = { live: 0, pre: 1, final: 2 } as const;
  games.sort((a, b) => rank[a.state] - rank[b.state] || Date.parse(a.start) - Date.parse(b.start));
  const upcoming = schedule
    .filter((it) => (it.allDay ? Date.parse(it.end ?? it.start) : itemEnd(it)) > now)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
    .slice(0, 25);
  return { games, upcoming, fetchedAt: new Date(now).toISOString(), notes };
}

let payloadCache: { at: number; payload: ScoresPayload } | null = null;
let inFlight: Promise<ScoresPayload> | null = null;

/** The live games payload. Cached for 30 seconds. Never throws. */
export async function getScores(now = Date.now()): Promise<ScoresPayload> {
  if (payloadCache && now - payloadCache.at < 30_000) return payloadCache.payload;
  if (!inFlight) {
    inFlight = assemble(now)
      .catch((e): ScoresPayload => ({ games: demoGames(now), upcoming: [], fetchedAt: new Date(now).toISOString(), notes: [`scores unavailable: ${e instanceof Error ? e.message : "error"}`] }))
      .then((payload) => { payloadCache = { at: now, payload }; return payload; })
      .finally(() => { inFlight = null; });
  }
  return inFlight;
}
