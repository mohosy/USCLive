"use client";

import { ArrowUp, CornerUpLeft, CornerUpRight, Flag, Footprints, Landmark, LoaderCircle, Pause, Play, RotateCcw, X } from "lucide-react";
import type { WalkProgress } from "./WalkGuide";
import { cx } from "../ui";

function TurnIcon({ text, size = 22 }: { text: string; size?: number }) {
  const t = text.toLowerCase();
  if (t.includes("destination") || t.includes("arrive")) return <Flag size={size} />;
  if (t.includes("left")) return <CornerUpLeft size={size} />;
  if (t.includes("right")) return <CornerUpRight size={size} />;
  return <ArrowUp size={size} />;
}

const fmtM = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(0, Math.round(m / 5) * 5)} m`);

export default function WalkHUD({
  p,
  fromLabel,
  toName,
  toCode,
  onPause,
  onResume,
  onRestart,
  onClose,
}: {
  p: WalkProgress;
  fromLabel: string;
  toName: string;
  toCode: string;
  onPause: () => void;
  onResume: () => void;
  onRestart: () => void;
  onClose: () => void;
}) {
  const pct = p.totalM ? Math.min(100, (p.traveledM / p.totalM) * 100) : 0;
  const leftMin = Math.max(0, Math.ceil(((p.totalM - p.traveledM) / Math.max(1, p.totalM)) * p.realMinutes));
  const toNext = p.nextStep ? p.nextStep.startM - p.traveledM : p.totalM - p.traveledM;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-14 z-20 flex justify-center px-4">
      <div className="fade-in pointer-events-auto w-full max-w-[560px] overflow-hidden rounded-2xl border border-line bg-white/95 shadow-xl backdrop-blur">
        {/* header */}
        <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-cardinal text-white">
            <Footprints size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">
              {fromLabel} → {toName}{toCode && <span className="text-muted"> ({toCode})</span>}
            </div>
            <div className="text-xs text-muted">
              {p.phase === "loading"
                ? "Finding the best walking route…"
                : `${p.realMinutes} min walk · ${fmtM(p.totalM)}${p.fallback ? " · straight-line estimate" : " · campus walkways"}`}
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted hover:bg-surface hover:text-foreground" aria-label="End walk">
            <X size={16} />
          </button>
        </div>

        {/* body */}
        {p.phase === "loading" ? (
          <div className="flex items-center gap-3 px-4 py-4 text-sm text-muted">
            <LoaderCircle size={18} className="animate-spin" /> Loading your 3D guide…
          </div>
        ) : p.phase === "error" ? (
          <div className="px-4 py-4 text-sm text-red-700">Couldn&apos;t start the walk: {p.error}</div>
        ) : p.phase === "arrived" ? (
          <div className="flex items-center gap-3 px-4 py-4">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-gold/30 text-2xl">🎉</span>
            <div className="flex-1">
              <div className="text-[15px] font-semibold">You&apos;ve arrived at {toName}</div>
              <div className="text-xs text-muted">
                {p.realMinutes} min on foot · {fmtM(p.totalM)} from {fromLabel}
              </div>
            </div>
            <button onClick={onRestart} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-medium hover:bg-surface">
              <RotateCcw size={14} /> Replay
            </button>
            <button onClick={onClose} className="rounded-lg bg-cardinal px-3 py-2 text-xs font-medium text-white hover:bg-cardinal-hover">
              Done
            </button>
          </div>
        ) : (
          <div className="px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-foreground text-white">
                <TurnIcon text={p.phase === "overview" ? "straight" : p.nextStep?.instruction ?? p.step?.instruction ?? ""} />
              </span>
              <div className="min-w-0 flex-1">
                {p.phase === "overview" ? (
                  <>
                    <div className="text-[15px] font-semibold">Here&apos;s your route</div>
                    <div className="text-xs text-muted">Starting your 3D walk from {fromLabel}…</div>
                  </>
                ) : (
                  <>
                    <div className="truncate text-[15px] font-semibold">{p.nextStep?.instruction ?? p.step?.instruction}</div>
                    <div className="text-xs text-muted">
                      {p.nextStep ? `in ${fmtM(toNext)}` : `${fmtM(toNext)} to go`} · {leftMin} min left
                    </div>
                  </>
                )}
              </div>
              <div className="flex gap-1">
                {p.phase === "paused" ? (
                  <button onClick={onResume} className="rounded-lg border border-line p-2 hover:bg-surface" aria-label="Resume" title="Resume">
                    <Play size={15} />
                  </button>
                ) : (
                  <button onClick={onPause} disabled={p.phase !== "walking"} className="rounded-lg border border-line p-2 hover:bg-surface disabled:opacity-40" aria-label="Pause" title="Pause">
                    <Pause size={15} />
                  </button>
                )}
                <button onClick={onRestart} className="rounded-lg border border-line p-2 hover:bg-surface" aria-label="Restart" title="Restart">
                  <RotateCcw size={15} />
                </button>
              </div>
            </div>

            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface">
              <div className="h-full rounded-full bg-cardinal transition-[width] duration-150" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
              <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 transition-opacity", p.passing ? "bg-amber-50 text-amber-800 opacity-100" : "opacity-0")}>
                <Landmark size={11} /> Passing {p.passing ?? "…"}
              </span>
              <span>{p.phase === "paused" ? "Paused · drag the map to look around" : "Fast-forwarded preview"}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
