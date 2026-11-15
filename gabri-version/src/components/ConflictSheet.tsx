"use client";

import { CalendarClock, Footprints } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { Conflict } from "@/lib/conflicts";
import { Button } from "./ui";

/**
 * Shown when signing up for something that clashes with your schedule: the conflicts, then your call.
 * "Register anyway" saves it (the event is then marked, e.g. "Overlaps FBE 403"); "Cancel" changes nothing.
 */
export default function ConflictSheet({ title, conflicts, busy, goLabel = "Register anyway", onGo, onCancel }: {
  /** the event being signed up for */
  title: string;
  conflicts: Conflict[];
  busy?: boolean;
  goLabel?: string;
  onGo: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onCancel]);
  // drawn on the page itself, not inside the side panel: the panel's frosted glass would otherwise confine it to the panel
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/25 p-4 sm:items-center" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div role="alertdialog" aria-label="Schedule conflict" className="fade-in w-full max-w-sm rounded-2xl border border-line bg-white p-4 shadow-2xl">
        <div className="text-[15px] font-semibold leading-snug">This clashes with your schedule</div>
        <div className="mt-0.5 truncate text-sm text-muted">{title}</div>
        <ul className="mt-3 space-y-2">
          {conflicts.map((c, i) => (
            <li key={i} className="flex items-start gap-2.5 rounded-xl bg-surface px-3 py-2.5 text-sm">
              {c.type === "overlap" ? <CalendarClock size={16} className="mt-0.5 shrink-0 text-cardinal" aria-hidden="true" /> : <Footprints size={16} className="mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />}
              <span className="min-w-0">{c.text}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex gap-2">
          <Button className="flex-1 whitespace-nowrap !rounded-full" disabled={busy} onClick={onGo}>{goLabel}</Button>
          <Button variant="secondary" className="flex-1 whitespace-nowrap !rounded-full" disabled={busy} onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
