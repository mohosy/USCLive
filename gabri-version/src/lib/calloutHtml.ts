/** HTML for a map callout bubble, shared by the Explore (Mapbox) and Satellite (Google 3D) views. */
import type { Callout } from "./callouts";
import { gameState } from "./games";

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Inner HTML of a callout bubble. Games get their score/clock filled in separately every second. */
/** Video-camera glyph (lucide "video"), inlined so markers need no React. */
const CAM_SVG = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>`;

export function calloutHTML(c: Callout, now: Date) {
  // webcams are icons on the map, not cards: the name shows on hover, the stream opens on click
  if (c.kind === "webcam") {
    return `<div class="cam-pin" aria-label="${esc(c.title)} live camera">${CAM_SVG}<i class="cam-live"></i><span class="cam-label">${esc(c.title)}</span></div><div class="cam-stem"></div><div class="co-foot"></div>`;
  }
  let title = esc(c.title);
  let meta = c.meta ? esc(c.meta) : "";
  if (c.game) {
    const g = gameState(c.game.info, c.game.start, now);
    title = `${esc(c.game.info.home)} <b>${g.home}</b><span class="co-dash">–</span><b>${g.away}</b> ${esc(c.game.info.away)}`;
    meta = `${g.period}${g.clock ? ` · ${g.clock}` : ""}`;
  }
  const dot = c.kind === "busy" ? "#ea580c" : c.kind === "quiet" ? "#16a34a" : c.kind === "alert" || c.kind === "alertmini" || c.kind === "game" ? "#dc2626" : "";
  return `<div class="co-card">
    <div class="co-eyebrow">${dot ? `<i style="background:${dot}" class="${c.kind === "game" || c.kind === "alert" ? "co-blink" : ""}"></i>` : ""}${esc(c.eyebrow)}</div>
    <div class="co-title">${title}${meta && (c.kind === "busy" || c.kind === "quiet") ? ` <span class="co-meta">· ${meta}</span>` : ""}</div>
    ${meta && c.kind !== "busy" && c.kind !== "quiet" ? `<div class="co-meta">${meta}</div>` : ""}
  </div><div class="co-stem"></div><div class="co-foot"></div>`;
}

