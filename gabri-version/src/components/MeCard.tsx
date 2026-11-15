"use client";

import { Footprints, Search, X } from "lucide-react";
import { useEffect } from "react";
import { BUILDING_BY_ID, distanceMeters } from "@/lib/campus";
import type { Loc } from "@/lib/client-types";
import { Button } from "./ui";

/** Where you are, in words: "at" a building when you are on top of it, "near" it otherwise. */
export function whereLine(loc: Loc) {
  const b = loc.buildingId ? BUILDING_BY_ID[loc.buildingId] : undefined;
  if (!b) return "You're on campus";
  return `You're ${distanceMeters(loc, b) <= 60 ? "at" : "near"} ${b.name}`;
}

/** Opens when you tap your Trojan: where you are, and the two things you most often want from there. */
export default function MeCard({ loc, gps, accuracyM, onNear, onPlay, onClose }: {
  loc: Loc;
  /** "on" = the browser's real location; anything else = the default spot on campus */
  gps: "off" | "asking" | "on";
  accuracyM: number | null;
  onNear: () => void;
  onPlay: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className="me-card" role="dialog" aria-label="Your location">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold leading-tight">{whereLine(loc)}</div>
          <div className="mt-0.5 text-xs text-muted">
            {gps === "on"
              ? accuracyM != null ? `Your real location, accurate to about ${Math.max(1, Math.round(accuracyM))} m.` : "Your real location."
              : "The default spot on campus. Allow location to use your real one."}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted hover:bg-surface"><X size={15} aria-hidden="true" /></button>
      </div>
      <div className="mt-3 flex gap-2">
        <Button className="flex-1 !rounded-full" onClick={onNear}><Search size={15} aria-hidden="true" /> What&apos;s near me</Button>
        <Button variant="secondary" className="flex-1 !rounded-full" onClick={onPlay}><Footprints size={15} aria-hidden="true" /> Start play mode</Button>
      </div>
    </div>
  );
}
