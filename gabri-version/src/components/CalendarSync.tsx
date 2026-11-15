"use client";

import { Plus, RefreshCw, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { api, fmtTime } from "@/lib/client-types";
import { loadSession, updateSavedSession } from "./SignIn";
import { cx, inputCls } from "./ui";

interface SyncRes { added: number; deadlines: number; skipped: number; unplaced: { title: string; start: string; location: string }[] }

/** Pull a calendar link (Brightspace) into the app. */
export async function syncCalendar(url: string) {
  return api<SyncRes>("/api/import/ical", { json: { url } });
}

const rowCls = "flex items-center gap-2.5 py-2 text-[13.5px]";

/**
 * Calendars, kept small at the bottom of Home: Google Calendar syncs live; Brightspace adds due dates
 * (its feed has no rooms, so those land in "Coming up" and notifications, not on the map).
 */
export default function CalendarSync({ demo, google, onSyncGoogle, onDisconnectGoogle, onSynced, onOpenInbox }: {
  demo: boolean; google: { configured: boolean; connected: boolean; lastSync: string | null } | null;
  onSyncGoogle: () => Promise<void>; onDisconnectGoogle: () => Promise<void>; onSynced: () => void; onOpenInbox: () => void;
}) {
  const [gBusy, setGBusy] = useState(false);
  const [url, setUrl] = useState(() => loadSession()?.calendarUrl ?? "");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const linked = !!loadSession()?.calendarUrl;

  async function sync() {
    setBusy(true); setMsg(null);
    try {
      const r = await syncCalendar(url.trim());
      updateSavedSession({ calendarUrl: url.trim() });
      setMsg(`${r.deadlines + r.skipped} due dates${r.added ? ` · ${r.added} on the map` : ""}`);
      setEditing(false);
      onSynced();
    } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  }

  return (
    <section className="border-t border-[#eeece8] pt-3">
      <h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted">Calendars</h2>

      {/* Google Calendar: live */}
      {google?.connected ? (
        <div className={rowCls}>
          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
          <span className="min-w-0 flex-1 font-medium">Google Calendar <span className="font-normal text-muted">· live{google.lastSync ? ` · ${fmtTime(google.lastSync)}` : ""}</span></span>
          <button type="button" title="Sync now" aria-label="Sync Google Calendar now" disabled={gBusy} onClick={async () => { setGBusy(true); await onSyncGoogle(); setGBusy(false); }} className="rounded-full p-1 text-muted hover:bg-surface hover:text-foreground">
            <RefreshCw size={14} className={cx(gBusy && "animate-spin")} />
          </button>
          <button type="button" title="Disconnect" aria-label="Disconnect Google Calendar" onClick={() => void onDisconnectGoogle()} className="rounded-full p-1 text-muted hover:bg-surface hover:text-foreground"><X size={14} /></button>
        </div>
      ) : google?.configured ? (
        <a href="/api/auth/google/start" className={cx(rowCls, "font-medium hover:text-cardinal")}><Plus size={15} className="text-muted" /> Connect Google Calendar</a>
      ) : null}

      {/* Brightspace: due dates by link */}
      <div className={rowCls}>
        <span className={cx("h-2 w-2 shrink-0 rounded-full", linked ? "bg-emerald-500" : "bg-[#d6d3cc]")} />
        <span className="min-w-0 flex-1 font-medium">Brightspace <span className="font-normal text-muted">· {msg ?? (linked ? "due dates synced" : "due dates")}</span></span>
        <button type="button" onClick={() => setEditing((v) => !v)} className="text-[12.5px] font-medium text-muted hover:text-foreground">{linked ? "Edit" : "Add"}</button>
      </div>
      {editing && (
        <form className="mb-2" onSubmit={(e) => { e.preventDefault(); if (url.trim().length > 10) void sync(); }}>
          <div className="flex gap-2">
            <input className={cx(inputCls, "text-xs")} placeholder="Paste your Brightspace calendar link" value={url} onChange={(e) => setUrl(e.target.value)} autoFocus />
            <button type="submit" disabled={busy || url.trim().length < 10} className="shrink-0 rounded-full border border-line px-3 text-xs font-medium hover:bg-surface disabled:opacity-50">{busy ? "Syncing" : "Sync"}</button>
          </div>
          <p className="mt-1 text-[11.5px] text-muted">Brightspace → Calendar → Subscribe → copy the link. Keep it private.</p>
        </form>
      )}

      {demo && (
        <button type="button" onClick={onOpenInbox} className={cx(rowCls, "w-full text-left text-muted hover:text-foreground")}>
          <Sparkles size={14} className="shrink-0 text-cardinal" /> AI inbox scan (demo)
        </button>
      )}
    </section>
  );
}
