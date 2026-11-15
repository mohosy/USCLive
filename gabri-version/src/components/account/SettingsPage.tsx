"use client";

import { Camera, Check, Lock, LogOut, Moon, Sun, Sunrise, Sunset, Trash2, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SCHOOLS } from "@/lib/campus";
import { api } from "@/lib/client-types";
import { INTERESTS } from "@/lib/directory";
import { loadMapLighting, loadShowPeople, saveMapLighting, saveOpenIn, saveShowPeople, type MapLighting } from "@/lib/mapLighting";
import { mergePrefs } from "@/lib/prefs";
import type { UserPrefs } from "@/lib/types";
import { PrefsCards, Segmented, type SavePrefs } from "./PrefsCards";
import { AccountTypePicker, clearSession, updateSavedSession, type AccountType } from "../SignIn";
import { Avatar, cx, inputCls } from "../ui";
import { UsernameInput, useUsernameStatus } from "../UsernameField";
import AccountShell from "./AccountShell";
import { useAccount, type ProfileView } from "./useAccount";

const PRONOUNS = ["she/her", "he/him", "they/them", "she/they", "he/they"];

/** Center-crop an image file to a small square JPEG (keeps the upload tiny). */
async function toSquareJpeg(file: File, size = 320): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("That file isn't an image we can read."));
      i.src = url;
    });
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    const c = document.createElement("canvas");
    c.width = c.height = size;
    c.getContext("2d")!.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
    return c.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function SettingsPage() {
  const { data, status, setData } = useAccount();
  return (
    <AccountShell
      status={status}
      right={<Link href="/profile" className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-medium text-muted hover:bg-surface hover:text-foreground"><UserRound size={15} /> Profile</Link>}
    >
      {data && <Form key={data.profile.id} initial={data.profile} onSaved={(profile) => setData({ ...data, profile })} />}
    </AccountShell>
  );
}

function Form({ initial, onSaved }: { initial: ProfileView; onSaved: (p: ProfileView) => void }) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [username, setUsername] = useState(initial.username);
  const uStatus = useUsernameStatus(username, initial.username);
  const [pronounChoice, setPronounChoice] = useState(PRONOUNS.includes(initial.pronouns) ? initial.pronouns : initial.pronouns ? "custom" : "");
  const [customPronouns, setCustomPronouns] = useState(PRONOUNS.includes(initial.pronouns) ? "" : initial.pronouns);
  const [bio, setBio] = useState(initial.bio);
  const [photo, setPhoto] = useState<string | null>(initial.photo);
  const [interests, setInterests] = useState(initial.interests);
  const [accountType, setAccountType] = useState<AccountType>(initial.accountType);
  const [orgId, setOrgId] = useState(initial.creatorOrgId ?? "");
  // a preference kept in this browser; it applies straight away, without the Save bar (this form only renders in the browser)
  const [lighting, setLighting] = useState<MapLighting>(loadMapLighting);
  const [people, setPeople] = useState(loadShowPeople);
  // Settings that save the moment you change them (your Trojan, privacy, notifications, where the map opens)
  const [prefs, setPrefs] = useState<UserPrefs>(initial.prefs);
  const [prefsErr, setPrefsErr] = useState<string | null>(null);
  const savePrefs: SavePrefs = (patch) => {
    const before = prefs;
    const next = mergePrefs(prefs, patch);
    setPrefs(next); setPrefsErr(null);
    if (patch.map?.openIn) saveOpenIn(next.map.openIn);
    api<{ profile: ProfileView }>("/api/profile", { method: "PATCH", json: { prefs: patch } })
      .then((r) => { setPrefs(r.profile.prefs); updateSavedSession({ profile: { prefs: r.profile.prefs as unknown as Record<string, unknown> } }); })
      .catch((e) => { setPrefs(before); setPrefsErr(`That change was not saved: ${(e as Error).message}`); });
  };
  useEffect(() => { saveOpenIn(initial.prefs.map.openIn); }, [initial.prefs.map.openIn]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [postReason, setPostReason] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const accountRef = useRef<HTMLElement>(null);

  // /settings?section=account&reason=post: jump to account type (sent here when a student tries to post)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const t = setTimeout(() => {
      if (q.get("reason") === "post") setPostReason(true);
      if (q.get("section") === "account") accountRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
    return () => clearTimeout(t);
  }, []);

  const pronouns = pronounChoice === "custom" ? customPronouns.trim() : pronounChoice;
  const dirty =
    name !== initial.name || uStatus.u !== initial.username || pronouns !== initial.pronouns || bio !== initial.bio || photo !== initial.photo ||
    interests.join() !== initial.interests.join() || accountType !== initial.accountType || (orgId || null) !== initial.creatorOrgId;
  const edit = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setSaved(false); };

  async function pickPhoto(f: File | undefined) {
    if (!f) return;
    setErr(null);
    try { edit(setPhoto)(await toSquareJpeg(f)); } catch (e) { setErr((e as Error).message); }
  }

  async function save() {
    if (!name.trim()) return setErr("Your name can't be empty.");
    if (uStatus.state !== "ok") return setErr(uStatus.state === "checking" ? "Still checking that username…" : `Username: ${uStatus.msg || "pick one"}.`);
    setBusy(true); setErr(null);
    try {
      const patch = { name: name.trim(), username: uStatus.u, pronouns, bio: bio.trim(), photo, interests, accountType, creatorOrgId: accountType === "creator" ? orgId || null : null };
      const r = await api<{ profile: ProfileView }>("/api/profile", { method: "PATCH", json: patch });
      updateSavedSession({ username: uStatus.u, interests, accountType, creatorOrgId: patch.creatorOrgId, profile: { name: patch.name, pronouns, bio: patch.bio, photo } });
      onSaved(r.profile);
      setSaved(true);
      setPostReason(false);
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }

  const school = SCHOOLS.find((s) => s.id === initial.school)?.name ?? initial.school;

  return (
    <div className="fade-in">
      <h1 className="text-[28px] font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-muted">This is how other Trojans see you on USCLive.</p>

      <Card title="Profile">
        <div className="flex items-center gap-4">
          <Avatar initials={initial.avatar} photo={photo} size={84} />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => file.current?.click()} className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-3.5 py-2 text-sm font-medium text-white hover:opacity-90">
              <Camera size={15} /> {photo ? "Change photo" : "Upload photo"}
            </button>
            {photo && (
              <button type="button" onClick={() => edit(setPhoto)(null)} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3.5 py-2 text-sm font-medium hover:bg-surface">
                <Trash2 size={14} /> Remove
              </button>
            )}
            <p className="w-full text-xs text-muted">JPG, PNG or WebP. We crop it to a square.</p>
          </div>
          <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ""; }} />
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Name" hint="Use the name you go by.">
            <input className={inputCls} value={name} maxLength={60} onChange={(e) => edit(setName)(e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <div className="mb-1 text-xs font-medium text-muted">Username</div>
            <UsernameInput value={username} onChange={edit(setUsername)} status={uStatus} />
          </div>
          <Field label="Pronouns" hint="Shown next to your name.">
            <select className={inputCls} value={pronounChoice} onChange={(e) => edit(setPronounChoice)(e.target.value)}>
              <option value="">Don&apos;t show pronouns</option>
              {PRONOUNS.map((p) => <option key={p} value={p}>{p}</option>)}
              <option value="custom">Custom…</option>
            </select>
            {pronounChoice === "custom" && (
              <input className={cx(inputCls, "mt-2")} placeholder="e.g. xe/xem" maxLength={30} value={customPronouns} onChange={(e) => edit(setCustomPronouns)(e.target.value)} />
            )}
          </Field>
        </div>
        <Field label="Bio" hint={`${bio.length}/160`} className="mt-4">
          <textarea className={cx(inputCls, "min-h-[76px] resize-none")} maxLength={160} placeholder="Junior in CS. Always down for pickup soccer and free boba." value={bio} onChange={(e) => edit(setBio)(e.target.value)} />
        </Field>
        <div className="mt-4">
          <div className="mb-1.5 text-xs font-medium text-muted">Interests</div>
          <div className="flex flex-wrap gap-1.5">
            {INTERESTS.map((i) => {
              const on = interests.includes(i);
              return (
                <button key={i} type="button" aria-pressed={on} onClick={() => edit(setInterests)(on ? interests.filter((v) => v !== i) : [...interests, i])}
                  className={cx("rounded-full border px-3 py-1.5 text-xs font-medium transition-colors", on ? "border-cardinal bg-cardinal text-white" : "border-line bg-white hover:bg-surface")}>{i}</button>
              );
            })}
          </div>
        </div>
      </Card>

      {prefsErr && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{prefsErr}</p>}
      <PrefsCards prefs={prefs} save={savePrefs} firstName={name.trim().split(/\s+/)[0] || "Your name"} />

      <Card title="USC account" subtitle={initial.verified ? "These come from USC's directory and can't be changed here." : "Set when you created your account and can't be changed. In the real app these come from your USC sign-in."}>
        <div className="divide-y divide-line rounded-xl border border-line">
          <Locked label="Email" value={initial.email || "—"} />
          <Locked label="School" value={school} />
          {initial.major && <Locked label="Major" value={initial.major} />}
          {initial.year && <Locked label="Year" value={initial.year} />}
        </div>
      </Card>

      <Card title="Account type" subtitle="Students can browse and RSVP. Student Creators can also post events." refEl={accountRef}>
        {postReason && accountType !== "creator" && (
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
            Only Student Creator accounts can post events. Switch below, then save, to start posting.
          </div>
        )}
        <AccountTypePicker type={accountType} orgId={orgId} onType={edit(setAccountType)} onOrg={edit(setOrgId)} />
      </Card>

      <Card title="Map">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-medium" id="map-lighting-label">Map lighting</div>
          {/* Auto follows the real time at USC; the others hold the map at one time of day */}
          <div role="group" aria-labelledby="map-lighting-label" className="flex items-center gap-0.5 rounded-full bg-surface p-1 text-xs">
            {([["auto", null, "Auto"], ["dawn", Sunrise, "Dawn"], ["day", Sun, "Day"], ["dusk", Sunset, "Dusk"], ["night", Moon, "Night"]] as const).map(([k, Icon, label]) => (
              <button key={k} type="button" onClick={() => { setLighting(k); saveMapLighting(k); }} aria-label={label} aria-pressed={lighting === k} title={k === "auto" ? "Auto: follows the real time at USC" : label}
                className={cx("grid h-7 place-items-center rounded-full font-medium", Icon ? "w-7" : "px-2.5", lighting === k ? "bg-white text-foreground shadow-[0_1px_4px_rgba(0,0,0,0.12)]" : "text-muted hover:text-foreground")}>
                {Icon ? <Icon size={14} /> : "Auto"}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <div className="text-sm font-medium" id="map-open-label">Open in</div>
          <Segmented labelledBy="map-open-label" value={prefs.map.openIn} options={[["explore", "Explore"], ["satellite", "Satellite"]] as const} onChange={(openIn) => savePrefs({ map: { openIn } })} />
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
          <div>
            <div className="text-sm font-medium" id="map-people-label">Show people on the map</div>
            <div className="text-xs text-muted">Little Trojans at busy spots when you zoom in</div>
          </div>
          <button type="button" role="switch" aria-checked={people} aria-labelledby="map-people-label" onClick={() => { setPeople(!people); saveShowPeople(!people); }}
            className={cx("relative h-6 w-10 shrink-0 rounded-full transition-colors", people ? "bg-foreground" : "bg-line")}>
            <span className={cx("absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition-transform", people && "translate-x-4")} />
          </button>
        </div>
      </Card>

      <Card title="Connected" subtitle="Other accounts linked to USCLive.">
        <Connected />
      </Card>

      <div className="mt-6">
        <button type="button" onClick={() => { clearSession(); router.push("/"); }} className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-white px-3.5 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
          <LogOut size={14} /> Sign out
        </button>
      </div>

      {/* sticky save bar */}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
        <div className={cx("pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-full border border-line bg-white/90 py-2 pl-5 pr-2 shadow-lg backdrop-blur-xl transition-all", dirty || saved || err ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0")}>
          <div className="min-w-0 flex-1 truncate text-sm">
            {err ? <span className="font-medium text-red-700">{err}</span> : saved && !dirty ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700"><Check size={15} /> Saved · <Link href="/profile" className="underline underline-offset-2">view profile</Link></span>
            ) : <span className="text-muted">You have unsaved changes</span>}
          </div>
          <button type="button" disabled={busy || !dirty} onClick={save} className="rounded-full bg-cardinal px-4 py-2 text-sm font-medium text-white hover:bg-cardinal-hover disabled:opacity-40">
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Card({ title, subtitle, children, refEl }: { title: string; subtitle?: string; children: React.ReactNode; refEl?: React.Ref<HTMLElement> }) {
  return (
    <section ref={refEl} id={title === "Account type" ? "account" : undefined} className="mt-5 scroll-mt-20 rounded-3xl border border-line bg-white p-5 sm:p-6">
      <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
      {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Google Calendar: whether it is linked, read from the server. Linking happens from the Home panel on the map. */
function Connected() {
  const [g, setG] = useState<{ configured: boolean; connected: boolean } | null>(null);
  useEffect(() => {
    let live = true;
    api<{ configured: boolean; connected: boolean }>("/api/auth/google/status").then((r) => { if (live) setG(r); }).catch(() => { if (live) setG({ configured: false, connected: false }); });
    return () => { live = false; };
  }, []);
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-2.5 text-sm">
      <div className="min-w-0">
        <div className="font-medium">Google Calendar</div>
        <div className="text-xs text-muted">{!g ? "Checking…" : g.connected ? "Your calendar syncs to the Home panel. USCLive only reads it." : g.configured ? "Not connected. Connect it from the Home panel on the map." : "Not available on this server."}</div>
      </div>
      <span className={cx("shrink-0 rounded-full px-2.5 py-1 text-xs font-medium", g?.connected ? "bg-emerald-50 text-emerald-700" : "bg-surface text-muted")}>{g?.connected ? "Connected" : "Not connected"}</span>
    </div>
  );
}

function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <div className="mb-1 flex items-center justify-between text-xs font-medium text-muted"><span>{label}</span>{hint && <span className="font-normal">{hint}</span>}</div>
      {children}
    </label>
  );
}

function Locked({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5 text-sm">
      <div className="w-16 shrink-0 text-muted">{label}</div>
      <div className="min-w-0 flex-1 truncate">{value}</div>
      <Lock size={13} className="shrink-0 text-muted" aria-label="Set at sign-up" />
    </div>
  );
}
