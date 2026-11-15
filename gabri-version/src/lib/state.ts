/**
 * Where the app's state lives between requests.
 * - With SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY: one row (id "main") in the app_state table, saved with a
 *   version check so two requests changing things at once never overwrite each other (the loser re-runs).
 * - Without them (local dev): the in-memory copy, as before.
 * Every API route is wrapped in withState(): it loads the state, runs as the person in the session cookie,
 * saves if anything changed, and sets the cookie when someone signs in or out.
 */
import { DEMO_ID, fresh, memoryDb, requestCtx, type DB, type ReqCtx } from "./store";

const URL_ = process.env.SUPABASE_URL ?? "";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
export const persisted = () => !!(URL_ && KEY);
const COOKIE = "ul_uid";
const DEMO_REFRESH_MS = 4 * 3600_000; // demo events are relative to "now": regenerate them every few hours

const headers = () => ({ apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" });
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

/** Demo events are generated relative to "now"; refresh them every few hours, keeping people's accounts and their own data. */
function refreshDemo(d: DB) {
  if (Date.now() - d.seededAt < DEMO_REFRESH_MS) return;
  const f = fresh();
  const people = new Map(d.users.map((u) => [u.id, u]));
  d.users = [...f.users.map((u) => people.get(u.id) ?? u), ...d.users.filter((u) => !f.users.some((s) => s.id === u.id))];
  d.events = [...f.events, ...d.events.filter((e) => e.source !== "seed")];
  d.history = f.history;
  d.inbox = f.inbox;
  d.scannedInbox = [];
  d.notifications = [...f.notifications, ...d.notifications.filter((n) => n.userId)];
  d.alerts = [...f.alerts, ...d.alerts.filter((a) => a.source === "dps_log")];
  d.liveScriptIndex = 0;
  d.lastLiveTick = Date.now();
  d.reminded = [];
  d.seededAt = Date.now();
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
    const { out, ctx } = await run(cookieUid(req), async () => handler(req, ...rest));
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
