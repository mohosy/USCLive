"use client";

import { ArrowUp, CornerUpLeft, CornerUpRight, Flag, Landmark, LoaderCircle, Pause, Play, RotateCcw, X } from "lucide-react";
import type { WalkProgress } from "./WalkGuide";

function TurnIcon({ text, size = 20 }: { text: string; size?: number }) {
  const t = text.toLowerCase();
  if (t.includes("destination") || t.includes("arrive")) return <Flag size={size} />;
  if (t.includes("left")) return <CornerUpLeft size={size} />;
  if (t.includes("right")) return <CornerUpRight size={size} />;
  return <ArrowUp size={size} />;
}

const fmtM = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(0, Math.round(m / 5) * 5)} m`);
const fmtClock = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/**
 * Directions, maps-style, in the app's glass: the next turn in one pill at the top, the trip
 * (time left, distance, arrival, progress, pause/restart) in a slim bar above the search.
 */
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
  // eslint-disable-next-line react-hooks/purity -- the arrival time is read off the clock as the walk ticks
  const arrive = fmtClock(new Date(Date.now() + leftMin * 60_000));
  const dest = <>{toName}{toCode && <span className="wk-dim"> ({toCode})</span>}</>;

  let icon: React.ReactNode, title: React.ReactNode, sub: React.ReactNode;
  if (p.phase === "loading") { icon = <LoaderCircle size={20} className="animate-spin" />; title = "Finding your route"; sub = <>to {dest}</>; }
  else if (p.phase === "error") { icon = <X size={20} />; title = "Couldn't start the walk"; sub = p.error; }
  else if (p.phase === "arrived") { icon = <Flag size={20} />; title = <>You&apos;re at {dest}</>; sub = `${p.realMinutes} min on foot · ${fmtM(p.totalM)} from ${fromLabel}`; }
  else if (p.phase === "overview") { icon = <ArrowUp size={20} />; title = <>Walking to {dest}</>; sub = `${p.realMinutes} min · ${fmtM(p.totalM)} from ${fromLabel}`; }
  else { icon = <TurnIcon text={p.nextStep?.instruction ?? p.step?.instruction ?? ""} />; title = p.nextStep?.instruction ?? p.step?.instruction; sub = p.nextStep ? `in ${fmtM(toNext)}` : `${fmtM(toNext)} to ${toName}`; }

  const going = p.phase === "walking" || p.phase === "paused";
  return (
    <>
      {/* the next turn */}
      <div className="wk-top" role="status" aria-live="polite">
        <div className="wk-pill">
          <span className="wk-turn">{icon}</span>
          <div className="min-w-0 flex-1">
            <div className="wk-title">{title}</div>
            <div className="wk-sub">{sub}</div>
          </div>
          {p.phase === "arrived" ? (
            <button onClick={onClose} className="wk-done">Done</button>
          ) : (
            <button onClick={onClose} className="wk-x" aria-label="End walk" title="End walk"><X size={16} /></button>
          )}
        </div>
        <span className={"wk-passing" + (p.passing && going ? " wk-show" : "")}><Landmark size={12} /> Passing {p.passing ?? ""}</span>
      </div>

      {/* the trip */}
      {(going || p.phase === "overview" || p.phase === "arrived") && (
        <div className="wk-trip">
          <div className="min-w-0 flex-1">
            <div className="wk-trip-line">
              {p.phase === "arrived" ? <b>Arrived</b> : <><b>{leftMin} min</b><span>{fmtM(Math.max(0, p.totalM - p.traveledM))}</span><span>arrive {arrive}</span></>}
              {p.fallback && <span>straight-line estimate</span>}
            </div>
            <div className="wk-bar"><i style={{ width: `${p.phase === "arrived" ? 100 : pct}%` }} /></div>
          </div>
          {p.phase === "paused" ? (
            <button onClick={onResume} className="wk-btn" aria-label="Resume" title="Resume"><Play size={15} /></button>
          ) : (
            <button onClick={onPause} disabled={p.phase !== "walking"} className="wk-btn" aria-label="Pause" title="Pause"><Pause size={15} /></button>
          )}
          <button onClick={onRestart} className="wk-btn" aria-label="Replay the walk" title="Replay"><RotateCcw size={15} /></button>
        </div>
      )}
    </>
  );
}
