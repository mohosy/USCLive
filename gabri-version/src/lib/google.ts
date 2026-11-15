/**
 * Sign in with Google + read-only Google Calendar access (OAuth 2.0 authorization-code flow, server side).
 * Tokens never reach the browser: they are stored server-side on each person's account (in the app state,
 * Supabase when configured). Needs GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (see .env.example).
 */
import { allowedDomain, checkGoogleClaims } from "./googleClaims";
import { randomUUID } from "node:crypto";
import type { CalItem } from "./calendarImport";
import type { InboxItem } from "./types";
import { initialsOf } from "./directory";
import { currentUserId, db, signInAs } from "./store";

const SCOPES = "openid email profile https://www.googleapis.com/auth/calendar.readonly";
/** asked for only when someone taps "Connect Gmail" (read-only; nothing is ever sent or changed) */
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export interface GoogleSession {
  accessToken: string; refreshToken?: string; expiresAt: number;
  email: string; firstName: string; lastName: string; picture?: string;
  lastSync?: string;
  /** read-only Gmail access was granted (Connect Gmail in the Inbox) */
  gmail?: boolean;
}

// the allowed domain is usc.edu unless GOOGLE_ALLOWED_DOMAIN names another: leaving it unset never opens sign-in to everyone
const cfg = () => ({ id: process.env.GOOGLE_CLIENT_ID ?? "", secret: process.env.GOOGLE_CLIENT_SECRET ?? "", domain: allowedDomain(process.env.GOOGLE_ALLOWED_DOMAIN) });
export const googleConfigured = () => !!(cfg().id && cfg().secret);
/** where Google sends people back; must match the redirect URI registered in Google Cloud */
export const redirectUri = (req: Request) => `${new URL(req.url).origin}/api/auth/google/callback`;

/** The signed-in person's Google connection, if any. */
export function getSession(): GoogleSession | null {
  return db().google[currentUserId()] ?? null;
}
function save(s: GoogleSession | null) {
  const d = db(), uid = currentUserId();
  if (s) d.google[uid] = s; else delete d.google[uid];
}
export function disconnect() {
  const s = getSession();
  if (s) void fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(s.refreshToken ?? s.accessToken)}`, { method: "POST" }).catch(() => {});
  save(null);
}

export function authUrl(req: Request, state: string, gmail = false) {
  const p = new URLSearchParams({
    client_id: cfg().id, redirect_uri: redirectUri(req), response_type: "code", scope: gmail ? `${SCOPES} ${GMAIL_SCOPE}` : SCOPES, state,
    access_type: "offline", prompt: "consent", include_granted_scopes: "true",
  });
  p.set("hd", cfg().domain); // pre-selects the school account; it is only a hint, so the claims are checked on the way back
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cfg().id, client_secret: cfg().secret, ...params }), signal: AbortSignal.timeout(15_000),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error_description ?? d.error ?? `Google token error ${res.status}`);
  return d as { access_token: string; refresh_token?: string; expires_in: number; id_token?: string; scope?: string };
}

/** Finish sign-in: trade the one-time code for tokens and read who signed in. */
export async function finishSignIn(req: Request, code: string) {
  const t = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri(req) });
  // the ID token came straight from Google's token endpoint over TLS, so its claims can be read without re-verifying
  const claims = t.id_token ? JSON.parse(Buffer.from(t.id_token.split(".")[1], "base64url").toString()) : {};
  // only the school's own Google accounts: Google's `hd` claim must be the allowed domain (the email's ending is not enough)
  const who = checkGoogleClaims(claims, cfg().domain);
  if (!who.ok) throw new Error(who.error);
  const email = who.email;
  const s: GoogleSession = {
    accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: Date.now() + (t.expires_in - 60) * 1000,
    email, firstName: claims.given_name ?? "", lastName: claims.family_name ?? "", picture: claims.picture,
    gmail: (t.scope ?? "").includes("gmail.readonly"),
  };
  // the Google account is the person: sign this browser into the account with that email (new one if needed)
  const d = db();
  let u = d.users.find((x) => x.email?.toLowerCase() === email);
  if (!u) {
    const name = `${s.firstName} ${s.lastName}`.trim() || email;
    u = { id: `u_${randomUUID().replace(/-/g, "").slice(0, 16)}`, name, avatar: initialsOf(name), school: "all", year: "", major: "", friends: [], classes: [], interests: [], orgs: [], email, verified: false };
    d.users.push(u);
  }
  u.googleAccount = true;
  signInAs(u.id);
  save(s);
  return s;
}

async function accessToken() {
  const s = getSession();
  if (!s) throw new Error("Google isn't connected.");
  if (Date.now() < s.expiresAt) return s.accessToken;
  if (!s.refreshToken) throw new Error("Google session expired. Connect again.");
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: s.refreshToken });
  save({ ...s, accessToken: t.access_token, expiresAt: Date.now() + (t.expires_in - 60) * 1000 });
  return t.access_token;
}

async function gapi<T>(path: string): Promise<T> {
  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, { headers: { Authorization: `Bearer ${await accessToken()}` }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Google Calendar ${res.status}`);
  return res.json() as Promise<T>;
}

type GTime = { dateTime?: string; date?: string };
/** Every entry in the next two weeks from the calendars you have turned on in Google Calendar (repeats expanded by Google). */
export async function fetchCalendarItems(): Promise<CalItem[]> {
  const list = await gapi<{ items: { id: string; selected?: boolean; primary?: boolean }[] }>("/users/me/calendarList?minAccessRole=reader");
  const cals = list.items.filter((c) => c.primary || c.selected).slice(0, 8);
  const from = new Date(Date.now() - 3600_000).toISOString(), to = new Date(Date.now() + 14 * 864e5).toISOString();
  const items: CalItem[] = [];
  for (const c of cals) {
    const r = await gapi<{ items: { status?: string; summary?: string; location?: string; description?: string; start: GTime; end: GTime }[] }>(
      `/calendars/${encodeURIComponent(c.id)}/events?singleEvents=true&orderBy=startTime&maxResults=250&timeMin=${from}&timeMax=${to}`);
    for (const e of r.items ?? []) {
      if (e.status === "cancelled" || !e.start) continue;
      const allDay = !e.start.dateTime;
      const start = new Date(e.start.dateTime ?? `${e.start.date}T00:00:00`);
      const end = new Date(e.end?.dateTime ?? (e.end?.date ? `${e.end.date}T00:00:00` : +start + 3600_000));
      items.push({ title: e.summary ?? "", location: e.location ?? "", description: (e.description ?? "").replace(/<[^>]+>/g, " "), start, end, allDay });
    }
  }
  const s = getSession();
  if (s) save({ ...s, lastSync: new Date().toISOString() });
  return items;
}

/* ------------------------------ Gmail (read-only) ------------------------------ */

type GPart = { mimeType?: string; body?: { data?: string }; parts?: GPart[] };
type GMsg = { id: string; snippet?: string; internalDate?: string; payload?: GPart & { headers?: { name: string; value: string }[] } };
const b64 = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
function textOf(p: GPart | undefined): string {
  if (!p) return "";
  if (p.mimeType === "text/plain" && p.body?.data) return b64(p.body.data);
  for (const c of p.parts ?? []) { const t = textOf(c); if (t) return t; }
  if (p.mimeType === "text/html" && p.body?.data) return b64(p.body.data).replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ");
  return "";
}

/**
 * The last week of the student's real email (skipping promotions and social), read-only, for the AI scan.
 * Nothing is stored: the messages are scanned in this request and only their ids are remembered.
 */
export async function fetchGmailItems(max = 15): Promise<InboxItem[]> {
  const s = getSession();
  if (!s?.gmail) throw new Error("Connect Gmail first.");
  const h = { Authorization: `Bearer ${await accessToken()}` };
  const q = encodeURIComponent("newer_than:7d -category:promotions -category:social");
  const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${max}&q=${q}`, { headers: h, signal: AbortSignal.timeout(15_000) });
  if (listRes.status === 401 || listRes.status === 403) throw new Error("Gmail access was turned off. Connect Gmail again.");
  if (!listRes.ok) throw new Error(`Gmail ${listRes.status}`);
  const list = (await listRes.json()) as { messages?: { id: string }[] };
  const msgs = await Promise.all((list.messages ?? []).map(async ({ id }) => {
    const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, { headers: h, signal: AbortSignal.timeout(15_000) });
    return r.ok ? ((await r.json()) as GMsg) : null;
  }));
  return msgs.filter((m): m is GMsg => !!m).map((m) => {
    const head = (n: string) => m.payload?.headers?.find((x) => x.name.toLowerCase() === n)?.value ?? "";
    const body = (textOf(m.payload) || m.snippet || "").replace(/\s+/g, " ").trim().slice(0, 1500);
    return {
      id: `gm_${m.id}`, source: "gmail" as const, from: head("from"), subject: head("subject") || "(no subject)", body,
      receivedAt: m.internalDate ? new Date(Number(m.internalDate)).toISOString() : new Date().toISOString(),
    };
  });
}

