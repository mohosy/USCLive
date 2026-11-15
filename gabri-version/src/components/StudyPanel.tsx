"use client";

import { useEffect, useState } from "react";
import { api, type Building, type Loc } from "@/lib/client-types";
import StudyRooms from "./StudyRooms";
import { LEVEL_COLOR, cx } from "./ui";

interface Spot { building: Building; walk: number; fill: number; level: string; trend: string; ratio: number; label: string; count: number | null }

export default function StudyPanel({ loc, tick, onOpenBuilding }: { loc: Loc; tick: number; onOpenBuilding: (id: string) => void }) {
  const [spots, setSpots] = useState<Spot[] | null>(null);
  useEffect(() => {
    api<{ spots: Spot[] }>(`/api/study?lat=${loc.lat}&lng=${loc.lng}`).then((r) => setSpots(r.spots)).catch(() => setSpots([]));
  }, [loc.lat, loc.lng, tick]);

  const [mode, setMode] = useState<"seating" | "rooms">("seating");
  const toggle = (
    <div className="flex rounded-lg border border-line p-0.5" role="group" aria-label="Study spots">
      {(["seating", "rooms"] as const).map((m) => (
        <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={cx("flex-1 rounded-md py-1 text-xs font-medium", mode === m ? "bg-surface text-foreground" : "text-muted hover:text-foreground")}>
          {m === "seating" ? "Open seating" : "Bookable rooms"}
        </button>
      ))}
    </div>
  );
  if (mode === "rooms") return <div className="space-y-3">{toggle}<StudyRooms loc={loc} /></div>;

  return (
    <div className="space-y-3">
      {toggle}
      <p className="text-xs leading-relaxed text-muted">Sorted by how full each place is right now, distance, and noise level.</p>
      {!spots && <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-16" />)}</div>}
      <ul className="divide-y divide-line">
        {spots?.map((s) => (
          <li key={s.building.id}>
            <button onClick={() => onOpenBuilding(s.building.id)} className="w-full px-1 py-3 text-left hover:bg-surface">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">{s.building.name}</span>
                <span className="text-xs text-muted">{s.walk} min</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, s.fill)}%`, background: LEVEL_COLOR[s.level] }} />
                </div>
                <span className="w-14 text-right text-xs tabular-nums text-muted">{s.fill}% full</span>
              </div>
              <div className="mt-1.5 text-xs text-muted">
                {[s.building.studySpot?.quiet && "Quiet", s.building.studySpot?.outlets && "Outlets", s.building.studySpot?.openLate && "Open late", s.trend === "rising" ? "Filling up" : s.trend === "falling" ? "Emptying" : null].filter(Boolean).join(" · ")}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
