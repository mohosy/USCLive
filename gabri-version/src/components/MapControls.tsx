"use client";

import { Minus, Plus, RotateCcw, RotateCw } from "lucide-react";
import type { RefObject } from "react";

/**
 * The one control column in the bottom-right corner of both map views (Explore and Satellite):
 * rotate left, rotate right, zoom in, zoom out, compass. The compass needle is turned by the map itself
 * (through `needle`), so it follows the camera without re-rendering anything.
 */
export default function MapControls({ onRotate, onZoom, onNorth, needle }: {
  /** turn the map by this many degrees (negative = left) */
  onRotate: (by: number) => void;
  /** zoom by this many levels (negative = out) */
  onZoom: (by: number) => void;
  /** face north and go back to the default tilt */
  onNorth: () => void;
  needle: RefObject<SVGSVGElement | null>;
}) {
  return (
    <div className="map-controls" role="group" aria-label="Map controls">
      <button type="button" onClick={() => onRotate(-45)} aria-label="Rotate left" title="Rotate left"><RotateCcw size={16} aria-hidden="true" /></button>
      <button type="button" onClick={() => onRotate(45)} aria-label="Rotate right" title="Rotate right"><RotateCw size={16} aria-hidden="true" /></button>
      <button type="button" onClick={() => onZoom(1)} aria-label="Zoom in" title="Zoom in"><Plus size={17} aria-hidden="true" /></button>
      <button type="button" onClick={() => onZoom(-1)} aria-label="Zoom out" title="Zoom out"><Minus size={17} aria-hidden="true" /></button>
      <button type="button" onClick={onNorth} aria-label="Face north and reset the tilt" title="Face north and reset the tilt">
        <svg ref={needle} className="map-compass" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <path d="M9 1.5 12.2 9H5.8z" fill="#990000" />
          <path d="M9 16.5 5.8 9h6.4z" fill="#b4b4ba" />
        </svg>
      </button>
    </div>
  );
}
