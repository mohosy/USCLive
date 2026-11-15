"use client";

import { useEffect, useState } from "react";
import { SCHOOLS } from "@/lib/campus";
import { api } from "@/lib/client-types";
import type { DirectoryEntry } from "@/lib/directory";
import type { SchoolId } from "@/lib/types";
import { ORGS } from "@/lib/orgs";
import { suggestUsername } from "@/lib/username";
import { Button, cx, inputCls } from "./ui";
import { UsernameInput, useUsernameStatus } from "./UsernameField";

export type AccountType = "student" | "creator";
export interface SavedProfile { name?: string; pronouns?: string; bio?: string; photo?: string | null }
export interface Signup { firstName: string; lastName: string; school: SchoolId }
export interface Session {
  email: string;
  /** private calendar link synced from the Home panel (re-synced after the demo server restarts) */
  calendarUrl?: string;
  /** signed in with Google: the calendar syncs live */
  google?: boolean;
  /** a new (non-directory) account: what the student entered when creating it */
  signup?: Signup;
  interests: string[];
  accountType?: AccountType;
  creatorOrgId?: string | null;
  /** edits made in Settings, re-applied on reload because the demo server forgets them on restart */
  profile?: SavedProfile;
  /** @username (picked at sign-up or changed in Settings) */
  username?: string;
  /** friends added in the app (re-applied after the demo server restarts) */
  friendIds?: string[];
}
const KEY = "usclive.session";

export function loadSession(): Session | null {
  try { return JSON.parse(sessionStorage.getItem(KEY) ?? "null"); } catch { return null; }
}
export function clearSession() {
  try { sessionStorage.removeItem(KEY); } catch { /* private mode */ }
}
function saveSession(s: Session) {
  try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode or photo too large */ }
}
/** Apply a session on the server (also used on reload, because the demo store resets when the server restarts). */
export async function signIn(s: Session) {
  const r = await api<{ username: string; friendIds: string[] }>("/api/session", { json: { action: "signin", ...s } });
  saveSession({ ...s, username: r.username, friendIds: r.friendIds });
}
/** Merge Settings changes into the saved session so they survive a reload. */
export function updateSavedSession(patch: Partial<Session>) {
  const s = loadSession();
  if (!s) return;
  saveSession({ ...s, ...patch, profile: { ...s.profile, ...patch.profile } });
}

export const ACCOUNT_TYPES: { id: AccountType; title: string; desc: string }[] = [
  { id: "student", title: "Student", desc: "Find events, RSVP and join open invites." },
  { id: "creator", title: "Student Creator", desc: "Everything students get, plus post events for your club or org." },
];

/** Student / Student Creator picker (+ which org a creator posts for). Shared by sign-up and Settings. */
export function AccountTypePicker({ type, orgId, onType, onOrg }: { type: AccountType; orgId: string; onType: (t: AccountType) => void; onOrg: (id: string) => void }) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        {ACCOUNT_TYPES.map((t) => {
          const on = type === t.id;
          return (
            <button key={t.id} type="button" aria-pressed={on} onClick={() => onType(t.id)}
              className={cx("rounded-xl border p-3 text-left transition-colors", on ? "border-cardinal bg-cardinal/5 ring-1 ring-cardinal" : "border-line bg-white hover:bg-surface")}>
              <div className="flex items-center gap-1.5 text-sm font-semibold">{t.id === "creator" && <span className="text-amber-600">✦</span>}{t.title}</div>
              <div className="mt-0.5 text-[11.5px] leading-snug text-muted">{t.desc}</div>
            </button>
          );
        })}
      </div>
      {type === "creator" && (
        <label className="mt-2.5 block">
          <div className="mb-1 text-xs font-medium text-muted">Posting for</div>
          <select className={inputCls} value={orgId} onChange={(e) => onOrg(e.target.value)}>
            <option value="">Myself (independent creator)</option>
            {ORGS.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <p className="mt-1 text-[11px] text-muted">In the real app, Student Government verifies creator accounts before they can post.</p>
        </label>
      )}
    </div>
  );
}

/**
 * Sign-in gate: usc.edu email only. Demo students (mock USC directory) sign straight in.
 * Anyone else creates an account with their first and last name and school, and nothing else is filled in for them.
 */
export interface GooglePrefill { email: string; firstName: string; lastName: string }
export default function SignIn({ onDone, google }: { onDone: () => void; google?: GooglePrefill | null }) {
  const [step, setStep] = useState<"email" | "create">(google ? "create" : "email");
  const [email, setEmail] = useState(google?.email ?? "");
  const [first, setFirst] = useState(google?.firstName ?? "");
  const [last, setLast] = useState(google?.lastName ?? "");
  const [googleReady, setGoogleReady] = useState(false); // shown only when the server has Google credentials
  useEffect(() => { api<{ configured: boolean }>("/api/auth/google/status").then((r) => setGoogleReady(r.configured), () => {}); }, []);
  const [school, setSchool] = useState<SchoolId | "">("");
  // suggested from the name until the student types their own
  const [handle, setHandle] = useState<string | null>(null);
  const username = handle ?? suggestUsername(first, last);
  const uStatus = useUsernameStatus(username);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function go(s: Session) {
    try { await signIn(s); onDone(); }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  }
  async function next(address: string) {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ profile: DirectoryEntry | null; isNew: boolean }>("/api/session", { json: { action: "lookup", email: address } });
      if (r.profile) return go({ email: r.profile.email, interests: [] }); // demo student: straight in
      if (!r.isNew) return go({ email: address.trim().toLowerCase(), interests: [] }); // account already created: straight in, school stays as first chosen
      setStep("create");
      setBusy(false);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }
  function create() {
    if (!first.trim() || !last.trim() || !school || uStatus.state !== "ok") return;
    setBusy(true); setErr(null);
    void go({ email: email.trim().toLowerCase(), interests: [], accountType: "student", username: uStatus.u, signup: { firstName: first.trim(), lastName: last.trim(), school }, google: !!google });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-white/70 p-5 backdrop-blur-md">
      <div className="fade-in my-auto w-full max-w-sm rounded-2xl border border-line bg-white p-6 shadow-xl">
        <div className="text-[22px] font-semibold tracking-tight">USC<span className="text-cardinal">Live</span></div>
        {step === "email" ? (
          <form className="mt-1" onSubmit={(e) => { e.preventDefault(); next(email); }}>
            <p className="text-sm text-muted">Sign in to see what is happening on campus.</p>
            <label className="mt-4 block">
              <div className="mb-1 text-xs font-medium text-muted">USC email</div>
              <input className={inputCls} type="email" inputMode="email" autoComplete="email" placeholder="ttrojan@usc.edu" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            </label>
            {err && <p role="alert" className="mt-2 text-sm font-medium text-red-700">{err}</p>}
            <Button type="submit" className="mt-4 w-full" disabled={busy || !email.trim()}>Continue</Button>
            {googleReady && (
              <a href="/api/auth/google/start" className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium hover:bg-surface">
                <GoogleMark /> Continue with Google
              </a>
            )}
            <Button variant="secondary" className="mt-2 w-full" disabled={busy} onClick={() => { setEmail("ttrojan@usc.edu"); next("ttrojan@usc.edu"); }}>Use the demo student</Button>
          </form>
        ) : (
          <form className="mt-1 space-y-3" onSubmit={(e) => { e.preventDefault(); create(); }}>
            <p className="text-sm text-muted">{google ? "Signed in with Google. Pick your school to finish" : "Create your account"} for <span className="font-medium text-foreground">{email.trim().toLowerCase()}</span>.</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <div className="mb-1 text-xs font-medium text-muted">First name</div>
                <input className={inputCls} autoComplete="given-name" value={first} onChange={(e) => setFirst(e.target.value)} maxLength={40} autoFocus />
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-medium text-muted">Last name</div>
                <input className={inputCls} autoComplete="family-name" value={last} onChange={(e) => setLast(e.target.value)} maxLength={40} />
              </label>
            </div>
            <label className="block">
              <div className="mb-1 text-xs font-medium text-muted">School</div>
              <select className={inputCls} value={school} onChange={(e) => setSchool(e.target.value as SchoolId)}>
                <option value="" disabled>Select your school</option>
                {SCHOOLS.filter((x) => x.id !== "all").map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
              <p className="mt-1 text-[11px] text-muted">Your school can&apos;t be changed after this. In the real app it comes from your USC sign-in.</p>
            </label>
            <label className="block">
              <div className="mb-1 text-xs font-medium text-muted">Username</div>
              <UsernameInput value={username} onChange={setHandle} status={uStatus} />
            </label>
            {err && <p role="alert" className="text-sm font-medium text-red-700">{err}</p>}
            <Button type="submit" className="w-full" disabled={busy || !first.trim() || !last.trim() || !school || uStatus.state !== "ok"}>Create account</Button>
            <button type="button" className="w-full text-center text-xs text-muted hover:text-foreground" onClick={() => { setStep("email"); setErr(null); }}>Use a different email</button>
          </form>
        )}
        <p className="mt-4 text-center text-[11px] text-muted">Not an official USC service.</p>
      </div>
    </div>
  );
}

/** Google's "G" mark, as Google's sign-in guidelines ask for on the button. */
function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
