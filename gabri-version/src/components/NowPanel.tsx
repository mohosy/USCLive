"use client";

import { Navigation, RotateCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { BUILDING_BY_ID } from "@/lib/campus";
import { api, fmtTime, type AppState, type EventView, type Loc } from "@/lib/client-types";
import type { NowPlanT } from "@/lib/ai";
import { Button, CatLabel, cx } from "./ui";

interface NowRes {
  plan: NowPlanT;
  ai: boolean;
  freeMinutes: number;
  nextClass: { code: string; room: string; start: string; walk: number } | null;
  leaveBy: string | null;
}

/** Suggestions are reused for a few minutes (and across tab switches) instead of re-asking the AI each time. */
const TTL = 4 * 60_000;
let cache: { key: string; at: number; res: NowRes } | null = null;

const ACTION_LABEL: Record<string, string> = { join: "Join", go: "Go", study: "View", eat: "Join", rest: "View", prep: "View" };

export default function NowPanel({ state, loc, onOpenEvent, onOpenBuilding, onRsvp, onWalk, compact, active = true }: {
  state: AppState; loc: Loc; onOpenEvent: (id: string) => void; onOpenBuilding: (id: string) => void; onRsvp: (id: string) => Promise<void>;
  /** start walking directions to a building */
  onWalk?: (buildingId: string) => void;
  /** only fetch while the panel is on screen */
  active?: boolean;
  /** only the "Right now" suggestions (the Home tab shows the schedule itself) */
  compact?: boolean;
}) {
  const key = `${loc.lat},${loc.lng},${loc.label}`;
  const [res, setRes] = useState<NowRes | null>(() => (cache?.key === key ? cache.res : null));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await api<NowRes>("/api/ai/now", { json: { lat: loc.lat, lng: loc.lng, label: loc.label } });
      cache = { key: `${loc.lat},${loc.lng},${loc.label}`, at: Date.now(), res: r };
      setRes(r);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [loc.lat, loc.lng, loc.label]);

  useEffect(() => {
    if (!active) return;
    const fresh = cache?.key === key && Date.now() - cache.at < TTL;
    const t = setTimeout(() => (fresh ? setRes(cache!.res) : run()), 0);
    return () => clearTimeout(t);
  }, [run, active, key]);

  const eventsById = Object.fromEntries(state.events.map((e) => [e.id, e])) as Record<string, EventView>;
  const now = new Date(state.now);

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Right now</h2>
          <button onClick={run} disabled={loading} className="rounded-md p-1 text-muted hover:bg-surface hover:text-foreground" title="Refresh suggestions">
            <RotateCw size={14} className={cx(loading && "animate-spin")} />
          </button>
        </div>

        {!res && loading ? (
          <div className="space-y-2"><div className="skeleton h-5 w-3/4" /><div className="skeleton h-16" /><div className="skeleton h-16" /><div className="skeleton h-16" /></div>
        ) : err ? (
          <div className="text-sm text-red-700">{err}</div>
        ) : res ? (
          <div className={cx("space-y-3", loading && "opacity-50")}>
            <p className="text-[15px] leading-snug">{res.plan.headline}</p>
            {res.nextClass && res.leaveBy && (() => {
              const bId = state.me.today.find((c) => c.code === res.nextClass!.code)?.buildingId;
              return (
                <div className="flex items-center gap-3">
                  <p className="min-w-0 flex-1 text-xs text-muted">
                    {res.nextClass.code} at {fmtTime(res.nextClass.start)} in {res.nextClass.room}. Leave by <span className="font-medium text-foreground">{fmtTime(res.leaveBy)}</span>.
                  </p>
                  {bId && onWalk && (
                    <button type="button" onClick={() => onWalk(bId)} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
                      <Navigation size={12} /> Take me there
                    </button>
                  )}
                </div>
              );
            })()}
            <ol className="divide-y divide-line rounded-lg border border-line">
              {res.plan.suggestions.map((s, i) => {
                const ev = s.eventId ? eventsById[s.eventId] : undefined;
                const bId = ev?.buildingId ?? (s.buildingId !== "none" ? s.buildingId : undefined);
                return (
                  <li key={i} className="flex items-start gap-3 p-3">
                    <span className="mt-0.5 w-4 shrink-0 text-xs font-semibold text-muted">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <button className="text-left text-sm font-medium hover:underline" onClick={() => (ev ? onOpenEvent(ev.id) : bId && onOpenBuilding(bId))}>{s.title}</button>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted">{s.why}</p>
                      <div className="mt-1.5 flex items-center gap-3">
                        {ev && <CatLabel category={ev.category} />}
                        {bId && <span className="text-xs text-muted">{BUILDING_BY_ID[bId]?.name}</span>}
                      </div>
                    </div>
                    {ev && !ev.going && ev.visibility !== "invite" && (s.action === "join" || s.action === "eat" || s.action === "go") ? (
                      <Button variant="secondary" className="!px-2.5 !py-1 text-xs" onClick={() => onRsvp(ev.id)}>{ACTION_LABEL[s.action]}</Button>
                    ) : ev?.going ? (
                      <span className="text-xs text-emerald-700">Going</span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
            {res.plan.headsUp && <p className="text-xs text-muted">{res.plan.headsUp}</p>}
          </div>
        ) : null}
      </section>

      {!compact && (
      <section>
        <h2 className="mb-2 text-sm font-semibold">Today</h2>
        {state.me.today.length === 0 && <p className="text-sm text-muted">No classes today.</p>}
        <ul className="space-y-0.5">
          {state.me.today.map((c, i) => {
            const past = +new Date(c.end) < +now;
            const live = +new Date(c.start) <= +now && +new Date(c.end) > +now;
            return (
              <li key={i}>
                <button onClick={() => onOpenBuilding(c.buildingId)} className={cx("flex w-full items-baseline gap-3 rounded-md px-2 py-1.5 text-left hover:bg-surface", past && "opacity-40")}>
                  <span className="w-28 shrink-0 text-xs tabular-nums text-muted">{fmtTime(c.start)} – {fmtTime(c.end)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{c.kind === "class" ? `${c.code} · ${c.title}` : c.title}</span>
                    <span className="block text-xs text-muted">{c.room}{live ? " · now" : ""}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      )}
    </div>
  );
}
