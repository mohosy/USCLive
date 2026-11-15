/**
 * How the Events list reads: which colored tile an event gets, which section it falls under
 * ("Live now", "Starting soon", "Later today", ...), and the short time and "Register by" wording.
 * No runtime imports, so it can be checked on its own (scripts/check-event-list.mjs).
 */
export type TileKind = "sports" | "club" | "food" | "academic" | "career";
export type Sport = "football" | "basketball" | "baseball" | "soccer" | "volleyball" | "tennis" | "swim";

type TileEvent = { category: string; title: string; tags?: string[]; game?: { sport: string } | null };
type TimedEvent = { start: string; end: string };

const SPORT_WORDS: [Sport, RegExp][] = [
  ["football", /\bfootball\b/i],
  ["basketball", /\bbasketball\b|\bhoops\b/i],
  ["baseball", /\bbaseball\b|\bsoftball\b/i],
  ["soccer", /\bsoccer\b|\bfutsal\b/i],
  ["volleyball", /\bvolleyball\b/i],
  ["tennis", /\btennis\b|\bpickleball\b/i],
  ["swim", /\bswim(ming)?\b|\bwater polo\b|\baquatics?\b|\bdiving\b/i],
];
/** Which sport an event is, from the game it carries or its title and tags (null: no sport we name). */
export function sportOf(e: TileEvent): Sport | null {
  const text = `${e.game?.sport ?? ""} ${e.title} ${(e.tags ?? []).join(" ")}`;
  return SPORT_WORDS.find(([, re]) => re.test(text))?.[0] ?? null;
}

const FOOD_WORDS = /\b(boba|food|tacos?|pizza|brunch|breakfast|lunch|dinner|bbq|barbecue|potluck|snacks?|donuts?|ice cream|bake sale|coffee)\b/i;

/**
 * The tile on the left of a row: sports (green), clubs and student events (purple, people), food (orange, fork and
 * knife), academic (blue, book), career and info sessions (cardinal, briefcase).
 * The event's own type wins; "food" is for student, USC and community events that are about the food itself.
 */
export function tileFor(e: TileEvent): { kind: TileKind; sport: Sport | null } {
  if (e.game || e.category === "sports_watch" || e.category === "sports_play") return { kind: "sports", sport: sportOf(e) };
  if (e.category === "career") return { kind: "career", sport: null };
  if (e.category === "academic") return { kind: "academic", sport: null };
  if (FOOD_WORDS.test(e.title) || (e.tags ?? []).some((t) => /^food$/i.test(t))) return { kind: "food", sport: null };
  return { kind: "club", sport: null };
}

export type Section = "live" | "soon" | "today" | "tomorrow" | "week" | "past";
export const SOON_MIN = 60;
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function sectionOf(e: TimedEvent, now: Date): Section {
  const s = +new Date(e.start), en = +new Date(e.end), t = +now;
  if (en <= t) return "past";
  if (s <= t) return "live";
  if (s - t <= SOON_MIN * 60_000) return "soon";
  const days = Math.round((dayStart(new Date(e.start)) - dayStart(now)) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "tomorrow" : "week";
}

const ORDER: Section[] = ["live", "soon", "today", "tomorrow", "week", "past"];
const LABEL: Record<Section, string> = { live: "Live now", soon: "Starting soon", today: "Later today", tomorrow: "Tomorrow", week: "Later this week", past: "Earlier" };

/** The list in sections, in order, each sorted by start time; empty sections are left out. "Live now" carries its count. */
export function groupEvents<T extends TimedEvent>(events: T[], now: Date): { section: Section; label: string; events: T[] }[] {
  const by = new Map<Section, T[]>();
  for (const e of events) { const k = sectionOf(e, now); by.set(k, [...(by.get(k) ?? []), e]); }
  return ORDER.filter((k) => by.has(k)).map((k) => {
    const list = by.get(k)!.sort((a, b) => (k === "past" ? +new Date(b.start) - +new Date(a.start) : +new Date(a.start) - +new Date(b.start)));
    return { section: k, label: k === "live" ? `Live now · ${list.length}` : LABEL[k], events: list };
  });
}

/** "2 AM", "1:15 PM": the minutes only when there are some */
export function shortTime(iso: string) {
  const d = new Date(iso);
  const h = d.getHours(), m = d.getMinutes();
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
}
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** When, for the second line of a row: "until 2 AM", "in 11 min", "1:15 PM", "6 PM Thu", "Nov 8". */
export function whenLine(e: TimedEvent, now: Date) {
  const s = new Date(e.start);
  switch (sectionOf(e, now)) {
    case "live": return `until ${shortTime(e.end)}`;
    case "soon": return `in ${Math.max(1, Math.round((+s - +now) / 60_000))} min`;
    case "today": return shortTime(e.start);
    case "past": return `${MONTH[s.getMonth()]} ${s.getDate()}`;
    default: {
      const days = Math.round((dayStart(s) - dayStart(now)) / 86_400_000);
      return `${shortTime(e.start)} ${days < 7 ? WEEKDAY[s.getDay()] : `${MONTH[s.getMonth()]} ${s.getDate()}`}`;
    }
  }
}

/**
 * "Register by Fri" for an event you can still sign up for (a time when the deadline is today).
 * Null when there is no deadline, it has passed, sign-up is closed, or you are already in.
 */
export function registerBy(e: { registrationDeadline?: string | null; registration?: { closed?: boolean; status?: string | null } | null }, now: Date) {
  if (!e.registrationDeadline || !e.registration || e.registration.closed || e.registration.status) return null;
  const d = new Date(e.registrationDeadline);
  if (+d <= +now) return null;
  const days = Math.round((dayStart(d) - dayStart(now)) / 86_400_000);
  return `Register by ${days === 0 ? shortTime(e.registrationDeadline) : days < 7 ? WEEKDAY[d.getDay()] : `${MONTH[d.getMonth()]} ${d.getDate()}`}`;
}
