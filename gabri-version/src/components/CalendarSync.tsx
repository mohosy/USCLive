"use client";

import { CalendarSync as SyncIcon, ChevronDown, Sparkles } from "lucide-react";
import { useState } from "react";
import { api, fmtTime } from "@/lib/client-types";
import { loadSession, updateSavedSession } from "./SignIn";
import { Button, cx, inputCls } from "./ui";

interface SyncRes { added: number; deadlines: number; skipped: number; unplaced: { title: string; start: string; location: string }[] }

/** Pull a calendar (Brightspace, Google, Outlook) into the map with its private iCal link. */
export async function syncCalendar(url: string) {
  return api<SyncRes>("/api/import/ical", { json: { url } });
}

/**
 * "Sync your classes": paste a private calendar link; classes and deadlines land on your map, visible only to you.
 * The link is remembered for this browser session so a server restart re-syncs it. Demo students also get the AI inbox scan.
 */
export default function CalendarSync({ demo, onSynced, onOpenInbox }: { demo: boolean; onSynced: () => void; onOpenInbox: () => void }) {
  const [url, setUrl] = useState(() => loadSession()?.calendarUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<SyncRes | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const synced = !!loadSession()?.calendarUrl;

  async function sync() {
    setBusy(true); setErr(null);
    try {
      const r = await syncCalendar(url.trim());
      setRes(r);
      updateSavedSession({ calendarUrl: url.trim() });
      onSynced();
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }

  return (
    <section className="rounded-2xl border border-line bg-white/70 p-3.5">
      <div className="flex items-center gap-2">
        <SyncIcon size={16} className="text-cardinal" />
        <h2 className="text-sm font-semibold">{synced ? "Your calendar is synced" : "Sync your classes"}</h2>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted">Paste your calendar&apos;s private link. Classes and deadlines show up on your map, only for you.</p>
      <form className="mt-2.5 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (url.trim().length > 10) void sync(); }}>
        <input className={cx(inputCls, "text-xs")} placeholder="webcal:// or https:// calendar link" value={url} onChange={(e) => setUrl(e.target.value)} />
        <Button type="submit" variant="secondary" className="shrink-0 !rounded-full" disabled={busy || url.trim().length < 10}>{busy ? "Syncing" : synced ? "Re-sync" : "Sync"}</Button>
      </form>
      {err && <p role="alert" className="mt-2 text-xs font-medium text-red-700">{err}</p>}
      {res && (
        <div className="mt-2 text-xs text-muted">
          <p><span className="font-medium text-foreground">{res.added}</span> on your map · <span className="font-medium text-foreground">{res.deadlines}</span> deadlines{res.skipped ? ` · ${res.skipped} already there` : ""}</p>
          {res.unplaced.length > 0 && (
            <div className="mt-1.5">
              <p>No campus location, so not on the map:</p>
              <ul className="mt-0.5 space-y-0.5">
                {res.unplaced.map((u) => <li key={u.title} className="truncate">{u.title} · {fmtTime(u.start)}{u.location ? ` · ${u.location}` : ""}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
      <button type="button" onClick={() => setHelp((h) => !h)} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground">
        Where do I find the link? <ChevronDown size={13} className={cx("transition-transform", help && "rotate-180")} />
      </button>
      {help && (
        <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-muted">
          <li><span className="font-medium text-foreground">Brightspace:</span> Calendar → Subscribe → copy the feed link (due dates, quizzes).</li>
          <li><span className="font-medium text-foreground">Google Calendar:</span> Settings → your calendar → &quot;Secret address in iCal format&quot;.</li>
          <li><span className="font-medium text-foreground">Outlook:</span> Settings → Calendar → Shared calendars → Publish → copy the ICS link.</li>
          <li>Entries need a campus location (like &quot;THH 101&quot;) to be placed on the map. The link is private: don&apos;t share it.</li>
        </ul>
      )}
      {demo && (
        <button type="button" onClick={onOpenInbox} className="mt-3 flex w-full items-center gap-2 rounded-xl bg-surface px-3 py-2 text-left text-xs hover:bg-black/5">
          <Sparkles size={14} className="shrink-0 text-cardinal" />
          <span><span className="font-medium text-foreground">AI inbox scan (demo)</span><span className="text-muted"> · reads demo emails for events, deadlines, phishing and DPS alerts</span></span>
        </button>
      )}
    </section>
  );
}
