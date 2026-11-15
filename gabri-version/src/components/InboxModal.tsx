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

export default function InboxModal({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
  const [items, setItems] = useState<(InboxItem & { scanned: boolean })[]>([]);
  const [results, setResults] = useState<ScanT["items"]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { if (open) api<{ items: (InboxItem & { scanned: boolean })[] }>("/api/inbox").then((r) => setItems(r.items)); }, [open]);

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

  return (
    <Modal open={open} onClose={onClose} title="AI inbox scan (demo)" wide>
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted">Finds events, deadlines and invites in your email, Brightspace and calendar, and flags phishing. Runs on demo emails; real email access would need Google&apos;s approval.</p>
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
    </Modal>
  );
}
