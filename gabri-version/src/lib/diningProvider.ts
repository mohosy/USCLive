import { DINING_HALLS, HALL_IDS, HOURS_URL, currentMealFor, demoMenu, hoursFor, laDate, menuUrl, parseHours, parseMenu } from "@/lib/dining";
import type { DiningPayload, HallId, HallMenu, MenuMeal } from "@/lib/dining";
import { safeExternalUrl } from "@/lib/http";

// Server only. Fetches USC Hospitality menus and hours, and keeps them in memory for an hour.
// Failures are kept too: at most one request per hall per date per hour, even when it fails.

const HOUR = 60 * 60 * 1000;
const UA = { "User-Agent": "USCLive/0.1 (student hackathon project)" };
const SITE = /(^|\.)hospitality\.usc\.edu$/;
const MAX_BYTES = 1_500_000;

interface MenuResult { meals: MenuMeal[] | null; problem: string | null; fetchedAt: string }
interface Cache {
  menus: Map<string, { at: number; p: Promise<MenuResult> }>;
  hours: { at: number; p: Promise<{ html: string | null }> } | null;
}
// kept on globalThis so a dev-server reload does not forget what was fetched
const g = globalThis as { __diningCache?: Cache };
const cache: Cache = (g.__diningCache ??= { menus: new Map(), hours: null });

class HttpError extends Error {
  constructor(readonly status: number) { super(`HTTP ${status}`); }
}

async function getText(raw: string): Promise<string> {
  const url = safeExternalUrl(raw, SITE);
  if (!url) throw new Error("blocked address");
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!res.ok) { void res.body?.cancel(); throw new HttpError(res.status); }
  if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) { void res.body?.cancel(); throw new Error("too large"); }
  // read in chunks and stop the moment it is over the limit
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) { void reader.cancel(); throw new Error("too large"); }
    chunks.push(value);
  }
  const buf = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { buf.set(c, at); at += c.byteLength; }
  return new TextDecoder().decode(buf);
}

function why(e: unknown): string {
  if (e instanceof HttpError) return `HTTP ${e.status}`;
  if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) return "no reply in time";
  return "could not reach the site";
}

async function fetchMenu(hall: HallId, dateISO: string): Promise<MenuResult> {
  const fetchedAt = new Date().toISOString();
  try {
    const meals = parseMenu(JSON.parse(await getText(menuUrl(hall, dateISO))));
    return meals ? { meals, problem: null, fetchedAt } : { meals: null, problem: "nothing usable posted", fetchedAt };
  } catch (e) {
    return { meals: null, problem: e instanceof SyntaxError ? "unexpected reply" : why(e), fetchedAt };
  }
}

function cachedMenu(hall: HallId, dateISO: string, now: number): Promise<MenuResult> {
  const key = `${hall}|${dateISO}`;
  const hit = cache.menus.get(key);
  if (hit && now - hit.at < HOUR) return hit.p;
  for (const [k, v] of cache.menus) if (now - v.at >= HOUR) cache.menus.delete(k);
  const p = fetchMenu(hall, dateISO);
  cache.menus.set(key, { at: now, p });
  return p;
}

function cachedHours(now: number): Promise<{ html: string | null }> {
  if (cache.hours && now - cache.hours.at < HOUR) return cache.hours.p;
  const p = getText(HOURS_URL).then((html) => ({ html }), () => ({ html: null }));
  cache.hours = { at: now, p };
  return p;
}

async function loadHall(hall: HallId, dateISO: string, now: number): Promise<{ menu: HallMenu; notes: string[] }> {
  const info = DINING_HALLS[hall];
  const notes: string[] = [];
  let meals: MenuMeal[];
  let live = false;
  let fetchedAt = new Date(now).toISOString();
  try {
    const r = await cachedMenu(hall, dateISO, now);
    fetchedAt = r.fetchedAt;
    if (r.meals) { meals = r.meals; live = true; }
    else { meals = demoMenu(hall, dateISO); notes.push(`${info.short}: menu unavailable (${r.problem}), showing the demo menu`); }
  } catch {
    meals = demoMenu(hall, dateISO);
    notes.push(`${info.short}: menu unavailable, showing the demo menu`);
  }

  // the hours page only knows today; any other day uses the usual hours
  let shifts: { open: number; close: number }[] | null = null;
  if (dateISO === laDate(now)) {
    try {
      const { html } = await cachedHours(now);
      shifts = html ? parseHours(html, info.hoursLocationId, now) : null;
    } catch { shifts = null; }
    if (!shifts) notes.push(`${info.short}: opening hours unavailable from USC, showing the usual hours`);
  }

  const menu: HallMenu = {
    hall, name: info.name, short: info.short, buildingId: info.buildingId, lat: info.lat, lng: info.lng,
    date: dateISO, meals, currentMeal: currentMealFor(meals, now, dateISO),
    hours: hoursFor(hall, dateISO, now, shifts),
    source: live ? "usc" : "demo", sourceLabel: live ? "Menu · USC Hospitality" : "Demo menu", fetchedAt,
  };
  return { menu, notes };
}

/** One hall's menu and hours. Never throws. */
export async function getHallMenu(hall: HallId, dateISO: string, now: number = Date.now()): Promise<HallMenu> {
  return (await loadHall(hall, dateISO, now)).menu;
}

/** All halls (or the ones asked for) for a day. Never throws. */
export async function getDining(dateISO: string, halls: HallId[] = HALL_IDS, now: number = Date.now()): Promise<DiningPayload> {
  const all = await Promise.all(halls.map((h) => loadHall(h, dateISO, now)));
  return { date: dateISO, halls: all.map((x) => x.menu), notes: all.flatMap((x) => x.notes) };
}
