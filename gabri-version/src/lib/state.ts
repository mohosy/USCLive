/**
 * Where the app's state lives between requests.
 * - With SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY: one row (id "main") in the app_state table, saved with a
 *   version check so two requests changing things at once never overwrite each other (the loser re-runs).
 * - Without them (local dev): the in-memory copy, as before.
 * Every API route is wrapped in withState(): it loads the state, runs as the person in the session cookie,
 * saves if anything changed, and sets the cookie when someone signs in or out.
 */
import { DEMO_ID, fresh, memoryDb, requestCtx, type DB, type ReqCtx } from "./store";
import { reapply } from "./registration";

const URL_ = process.env.SUPABASE_URL ?? "";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
export const persisted = () => !!(URL_ && KEY);
const COOKIE = "ul_uid";
// Demo events are written relative to "now" (see seedEvents). They follow the clock, not the moment the server
// started: they are regenerated when they are half an hour old, and straight away when someone opens the app after
// nobody had it open for a few minutes, so a presenter always starts with a fresh set.
const DEMO_REFRESH_MS = 30 * 60_000;
const DEMO_IDLE_MS = 3 * 60_000;
/** The time demo data is relative to. The one place a demo clock would plug in. */
const demoNow = () => Date.now();
let lastRequestAt = 0; // this server's last request (not saved: only tells "nobody had the app open")

// legacy service_role keys are JWTs (eyJ…) and also go in Authorization; new sb_secret_ keys go only in apikey
const headers = (): Record<string, string> => ({ apikey: KEY, ...(KEY.startsWith("eyJ") ? { Authorization: `Bearer ${KEY}` } : {}), "Content-Type": "application/json" });
let cache: { json: string; version: number; at: number } | null = null;

async function load(): Promise<{ data: DB; version: number }> {
  if (!persisted()) return { data: memoryDb(), version: -1 };
  if (cache && Date.now() - cache.at < 1000) return { data: JSON.parse(cache.json), version: cache.version };
  const res = await fetch(`${URL_}/rest/v1/app_state?id=eq.main&select=data,version`, { headers: headers(), cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Supabase load ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const rows = (await res.json()) as { data: DB; version: number }[];
  if (!rows.length) {
    // first run: create the row (if another request beat us to it, just read theirs)
    const data = fresh();
    await fetch(`${URL_}/rest/v1/app_state`, { method: "POST", headers: { ...headers(), Prefer: "resolution=ignore-duplicates" }, body: JSON.stringify({ id: "main", data, version: 0 }) });
    cache = null;
    return load();
  }
  cache = { json: JSON.stringify(rows[0].data), version: rows[0].version, at: Date.now() };
  return { data: rows[0].data, version: rows[0].version };
}

/** Save if nobody else saved since we loaded. false = someone did; the caller re-runs. */
async function save(data: DB, version: number): Promise<boolean> {
  if (!persisted()) return true; // memory: already changed in place
  const res = await fetch(`${URL_}/rest/v1/app_state?id=eq.main&version=eq.${version}`, {
    method: "PATCH", headers: { ...headers(), Prefer: "return=representation" }, signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ data, version: version + 1, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`Supabase save ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const rows = (await res.json()) as unknown[];
  if (!rows.length) { cache = null; return false; }
  cache = { json: JSON.stringify(data), version: version + 1, at: Date.now() };
  return true;
}

/** Demo events are generated relative to "now"; keep them current, keeping people's accounts and their own data. */
function refreshDemo(d: DB) {
  const now = demoNow();
  const age = now - d.seededAt;
  const idle = now - lastRequestAt;
  lastRequestAt = now;
  if (age < DEMO_REFRESH_MS && !(idle >= DEMO_IDLE_MS && age >= DEMO_IDLE_MS)) return;
  const f = fresh();
  // what people did on the demo events since they were generated (going, invites) carries over to the new set
  const old = new Map(d.events.filter((e) => e.source === "seed").map((e) => [e.id, e]));
  for (const e of f.events) {
    const was = old.get(e.id);
    if (!was || was.title !== e.title) continue;
    for (const id of was.attendees) if (!e.attendees.includes(id) && d.users.some((u) => u.id === id)) e.attendees.push(id);
    for (const id of was.invitees) if (!e.invitees.includes(id)) e.invitees.push(id);
  }
  const people = new Map(d.users.map((u) => [u.id, u]));
  d.users = [...f.users.map((u) => people.get(u.id) ?? u), ...d.users.filter((u) => !f.users.some((s) => s.id === u.id))];
  // keep what people posted; the two demo posts that are not marked "seed" come back with the new set, so drop the old copies
  const regenerated = new Set(f.events.map((e) => e.id));
  d.events = [...f.events, ...d.events.filter((e) => e.source !== "seed" && !regenerated.has(e.id))];
  d.history = f.history;
  d.inbox = f.inbox;
  d.scannedInbox = [];
  d.notifications = [...f.notifications, ...d.notifications.filter((n) => n.userId)];
  d.alerts = [...f.alerts, ...d.alerts.filter((a) => a.source === "dps_log")];
  d.liveScriptIndex = 0;
  d.lastLiveTick = Date.now();
  d.reminded = [];
  d.registrations = (d.registrations ?? []).filter((r) => d.events.some((e) => e.id === r.eventId));
  reapply(d.events, d.registrations); // the regenerated demo events forget who registered: put them back
  d.seededAt = now;
}

const cookieUid = (req?: Request) => req?.headers.get("cookie")?.match(/(?:^|;\s*)ul_uid=([^;]+)/)?.[1];

async function run<T>(uid: string | undefined, fn: (ctx: ReqCtx) => Promise<T>): Promise<{ out: T; ctx: ReqCtx }> {
  for (let attempt = 0; ; attempt++) {
    const { data, version } = await load();
    refreshDemo(data);
    const before = persisted() ? JSON.stringify(data) : "";
    const ctx: ReqCtx = { db: data, uid: uid && data.users.some((u) => u.id === uid) ? uid : DEMO_ID };
    const out = await requestCtx.run(ctx, () => fn(ctx));
    if (!persisted() || JSON.stringify(ctx.db) === before) return { out, ctx };
    if (await save(ctx.db, version)) return { out, ctx };
    if (attempt >= 3) { console.error("[state] gave up after repeated save conflicts"); return { out, ctx }; }
  }
}

/** Wrap an API route: load state, run as the cookie's person, save changes, set the cookie on sign-in/out. */
export function withState<A extends unknown[]>(handler: (req: Request, ...rest: A) => Promise<Response> | Response) {
  return async (req: Request, ...rest: A): Promise<Response> => {
    // a save conflict re-runs the handler: read the body once and hand each run a fresh copy
    // (a second req.json() on the same request fails, which showed up as "Invalid JSON")
    const raw = req.method === "GET" || req.method === "HEAD" ? null : await req.arrayBuffer();
    const fresh = () => (raw === null ? req : new Request(req.url, { method: req.method, headers: req.headers, body: raw }));
    const { out, ctx } = await run(cookieUid(req), async () => handler(fresh(), ...rest));
    if (ctx.setCookie === undefined) return out;
    const res = new Response(out.body, out); // copy: some responses have read-only headers
    const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
    res.headers.append("Set-Cookie", ctx.setCookie
      ? `${COOKIE}=${ctx.setCookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`
      : `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
    return res;
  };
}

/** Background work outside a request (e.g. the DPS crime-log refresh after a response). */
export async function runWithState(fn: () => Promise<unknown>) {
  try { await run(undefined, fn); } catch (e) { console.error("[state] background job failed:", (e as Error).message); }
}
