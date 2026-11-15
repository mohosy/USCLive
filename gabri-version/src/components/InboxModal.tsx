"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-types";
import type { ScanT } from "@/lib/ai";
import type { InboxItem } from "@/lib/types";
import { Button, Modal, Tag } from "./ui";

const SRC = { gmail: "Gmail", brightspace: "Brightspace", gcal: "Google Calendar" } as const;
const KIND: Record<string, { label: string; tone: "neutral" | "food" | "live" | "class" | "private" | "open" }> = {
  event: { label: "Added to map", tone: "class" },
  invite: { label: "Invite", tone: "private" },
  deadline: { label: "Deadline", tone: "food" },
  announcement: { label: "Announcement", tone: "neutral" },
  phishing: { label: "Phishing", tone: "live" },
  ignore: { label: "Skipped", tone: "neutral" },
};

const cxRow = (embedded: boolean) => (embedded ? "flex flex-col items-start gap-3 border-t border-line pt-4" : "flex items-center justify-between gap-4 border-t border-line pt-4");

export default function InboxModal({ open, onClose, onChanged, embedded = false }: { open: boolean; onClose: () => void; onChanged: () => void; embedded?: boolean }) {
  const [items, setItems] = useState<(InboxItem & { scanned: boolean })[]>([]);
  const [results, setResults] = useState<ScanT["items"]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  // real Gmail (optional): connected through Google, read-only
  const [g, setG] = useState<{ connected: boolean; gmail: boolean } | null>(null);
  const [mail, setMail] = useState<(InboxItem & { scanned: boolean })[]>([]);
  const [mailMsg, setMailMsg] = useState<string | null>(null);
  useEffect(() => { if (open) api<{ connected: boolean; gmail: boolean }>("/api/auth/google/status").then(setG).catch(() => setG(null)); }, [open]);
  async function scanGmail() {
    setBusy("gmail"); setMailMsg(null);
    try {
      const r = await api<{ results: ScanT["items"]; items?: (InboxItem & { scanned: boolean })[]; message?: string; addedEvents?: string[] }>("/api/inbox/scan", { json: { source: "gmail" } });
      setResults((prev) => [...prev, ...r.results]);
      setMail((m) => [...(r.items ?? []), ...m]);
      const found = r.results.filter((x) => x.kind !== "ignore").length;
      setMailMsg(r.message ?? `Scanned ${r.items?.length ?? 0} emails: ${found ? `${found} worth knowing about` : "nothing to add"}${r.addedEvents?.length ? `, ${r.addedEvents.length} added to your map` : ""}.`);
      onChanged();
    } catch (e) { setMailMsg((e as Error).message); }
    setBusy(null);
  }

  useEffect(() => { if (open) api<{ items: (InboxItem & { scanned: boolean })[] }>("/api/inbox").then((r) => setItems(r.items)).catch(() => setMsg("Could not load your inbox. Close and reopen it to try again.")); }, [open]);

  async function scan() {
    setBusy("scan"); setMsg(null);
    try {
      const r = await api<{ results: ScanT["items"]; message?: string; addedEvents?: string[] }>("/api/inbox/scan", { method: "POST" });
      setResults((prev) => [...prev, ...r.results]);
      setItems((it) => it.map((i) => ({ ...i, scanned: true })));
      setMsg(r.message ?? (r.addedEvents?.length ? `${r.addedEvents.length} items added to your map.` : null));
      onChanged();
    } catch (e) { setMsg((e as Error).message); }
    setBusy(null);
  }
  async function scrape() {
    setBusy("scrape"); setMsg(null);
    try {
      const r = await api<{ report: { url: string; found: number; added: number; error?: string }[] }>("/api/scrape", { json: {} });
      setMsg(r.report.map((x) => `${new URL(x.url).hostname}: ${x.error ? `failed (${x.error})` : `${x.added} added`}`).join(". "));
      onChanged();
    } catch (e) { setMsg((e as Error).message); }
    setBusy(null);
  }

  const byId = Object.fromEntries(results.map((r) => [r.inboxId, r]));
  const allScanned = items.length > 0 && items.every((i) => i.scanned);

  const content = (
      <div className="space-y-5">
        {/* your real Gmail: optional, read-only, scanned by the AI on request */}
        <div className="space-y-2">
          <div className="text-sm font-medium">Your Gmail</div>
          {!g?.connected ? (
            <p className="text-xs text-muted">Sign in with Google to let the assistant scan your real email for events, deadlines and invites.</p>
          ) : !g.gmail ? (
            <>
              <p className="text-xs text-muted">Read-only. The AI scans your last week of email for events, deadlines and invites, and flags phishing. Only you see what it finds, and email text isn&apos;t stored.</p>
              <a href="/api/auth/google/start?gmail=1" className="inline-flex items-center rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium hover:bg-surface">Connect Gmail</a>
            </>
          ) : (
            <>
              <p className="text-xs text-muted">Scans your last week of email (not promotions or social). Only you see what it finds.</p>
              <Button disabled={!!busy} onClick={scanGmail}>{busy === "gmail" ? "Scanning your email..." : "Scan my Gmail"}</Button>
            </>
          )}
          {mailMsg && <p className="text-xs text-muted">{mailMsg}</p>}
          {mail.length > 0 && (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {mail.filter((i) => byId[i.id] && byId[i.id].kind !== "ignore").map((i) => {
                const r = byId[i.id];
                return (
                  <li key={i.id} className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><div className="truncate text-sm font-medium">{i.subject}</div><div className="truncate text-xs text-muted">{i.from}</div></div>
                      <Tag tone={KIND[r.kind].tone}>{KIND[r.kind].label}</Tag>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted">{r.summary}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className={cxRow(embedded)}>
          <p className="text-sm text-muted"><span className="font-medium text-foreground">Demo inbox.</span> Sample emails, Brightspace posts and invites, so anyone can see what the scan does.</p>
          <Button className="shrink-0" disabled={!!busy || allScanned} onClick={scan}>{busy === "scan" ? "Scanning..." : allScanned ? "Scanned" : "Scan inbox"}</Button>
        </div>

        <ul className="divide-y divide-line rounded-lg border border-line">
          {items.map((i) => {
            const r = byId[i.id];
            return (
              <li key={i.id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{i.subject}</div>
                    <div className="text-xs text-muted">{i.from} · {SRC[i.source]}</div>
                  </div>
                  {r && <Tag tone={KIND[r.kind].tone}>{KIND[r.kind].label}</Tag>}
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted">{r ? r.summary : i.body}</p>
              </li>
            );
          })}
        </ul>

        <div className="space-y-2 border-t border-line pt-4">
          <div className="text-sm font-medium">Public USC events</div>
          <p className="text-xs text-muted">Pulls events from public usc.edu event pages.</p>
          <Button variant="secondary" disabled={!!busy} onClick={scrape}>{busy === "scrape" ? "Importing" : "Import events"}</Button>
        </div>
        {msg && <p className="text-sm text-muted">{msg}</p>}
      </div>
  );
  return embedded ? (open ? content : null) : <Modal open={open} onClose={onClose} title="AI inbox scan" wide>{content}</Modal>;
}
