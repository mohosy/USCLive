"use client";

import { ArrowUp, LoaderCircle, Search, X } from "lucide-react";
import { useState } from "react";
import { BUILDING_BY_ID } from "@/lib/campus";
import type { EventView } from "@/lib/client-types";

export interface AskRes { answer: string; eventIds: string[]; buildingIds: string[]; focusBuildingId: string; ai: boolean }

/**
 * The bottom search box. It keeps its own text, so typing re-renders only this box, not the whole app
 * (the maps and side panel stay untouched while you type). Remount it (change its key) to clear the text.
 */
export default function AskBar({ res, busy, events, onAsk, onClear, onOpenEvent, onOpenBuilding }: {
  res: AskRes | null; busy: boolean; events: EventView[];
  onAsk: (q: string) => void; onClear: () => void; onOpenEvent: (id: string) => void; onOpenBuilding: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  return (
    <form className="campus-search" role="search" onSubmit={(e) => { e.preventDefault(); if (!busy) onAsk(q); }} onKeyDown={(e) => { if (e.key === "Escape" && res) { e.stopPropagation(); onClear(); } }}>
      <Search size={21} className="search-icon" aria-hidden="true" />
      <input aria-label="Ask about campus" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about campus or find a place…" className="campus-search-input" autoComplete="off" />
      <div className="search-actions">
        {(q || res) && !busy && <button type="button" onClick={() => { setQ(""); onClear(); }} className="icon-action" aria-label="Clear search"><X size={18} /></button>}
        <button type="submit" className="search-submit" aria-label={busy ? "Searching campus" : "Search campus"} disabled={busy || q.trim().length < 2}>
          {busy ? <LoaderCircle size={19} className="animate-spin" /> : <ArrowUp size={21} />}
        </button>
      </div>
      {busy && <span role="status" className="sr-only">Searching campus…</span>}
      {res && (
        <div className="search-results scroll-thin">
          <div className="mb-2 flex items-center justify-between gap-3"><span className="text-sm font-semibold">Campus search</span><button type="button" className="icon-action" aria-label="Close search results" onClick={onClear}><X size={18} /></button></div>
          <p role="status" className="text-sm leading-relaxed">{res.answer}</p>
          {(res.eventIds.length > 0 || res.buildingIds.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {res.eventIds.length > 0
                ? res.eventIds.map((id) => { const e = events.find((x) => x.id === id); return e ? <button type="button" key={id} onClick={() => { onOpenEvent(id); onClear(); }} className="min-h-11 rounded-lg bg-surface px-3 py-2 text-sm hover:text-cardinal">{e.title}</button> : null; })
                : res.buildingIds.map((id) => <button type="button" key={id} onClick={() => { onOpenBuilding(id); onClear(); }} className="min-h-11 rounded-lg bg-surface px-3 py-2 text-sm hover:text-cardinal">{BUILDING_BY_ID[id]?.name}</button>)}
            </div>
          )}
        </div>
      )}
    </form>
  );
}
