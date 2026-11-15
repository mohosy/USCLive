"use client";

import { Search, X } from "lucide-react";
import { useState } from "react";
import { BUILDING_BY_ID } from "@/lib/campus";
import type { EventView } from "@/lib/client-types";

export interface AskRes { answer: string; eventIds: string[]; buildingIds: string[]; focusBuildingId: string; ai: boolean }

/**
 * The header search box. It keeps its own text, so typing re-renders only this box, not the whole app
 * (the maps and side panel stay untouched while you type). Remount it (change its key) to clear the text.
 */
export default function AskBar({ res, busy, events, onAsk, onClear, onOpenEvent, onOpenBuilding }: {
  res: AskRes | null; busy: boolean; events: EventView[];
  onAsk: (q: string) => void; onClear: () => void; onOpenEvent: (id: string) => void; onOpenBuilding: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  return (
    <form className="relative max-w-xl flex-1" onSubmit={(e) => { e.preventDefault(); onAsk(q); }}>
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about campus, e.g. how do I get to THH, free food near me" className="h-9 w-full rounded-full bg-surface pl-9 pr-16 text-[14px] outline-none transition-colors focus:bg-white focus:shadow-[0_0_0_3px_rgba(153,0,0,0.12)]" />
      {res ? (
        <button type="button" onClick={() => { setQ(""); onClear(); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-foreground" aria-label="Clear"><X size={14} /></button>
      ) : busy ? <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">Searching</span> : null}
      {res && (
        <div className="menu absolute left-0 right-0 top-12 z-40 p-4" style={{ transformOrigin: "top center" }}>
          <p className="text-sm leading-relaxed">{res.answer}</p>
          {(res.eventIds.length > 0 || res.buildingIds.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {res.eventIds.length > 0
                ? res.eventIds.map((id) => { const e = events.find((x) => x.id === id); return e ? <button type="button" key={id} onClick={() => onOpenEvent(id)} className="rounded-md border border-line px-2 py-1 text-xs hover:bg-surface">{e.title}</button> : null; })
                : res.buildingIds.map((id) => <button type="button" key={id} onClick={() => onOpenBuilding(id)} className="rounded-md border border-line px-2 py-1 text-xs hover:bg-surface">{BUILDING_BY_ID[id]?.name}</button>)}
            </div>
          )}
        </div>
      )}
    </form>
  );
}
