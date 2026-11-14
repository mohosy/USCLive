/** HTML for a map callout bubble, shared by the Explore (Mapbox) and Satellite (Google 3D) views. */
import type { Callout } from "./callouts";
import { gameState } from "./games";

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Inner HTML of a callout bubble. Games get their score/clock filled in separately every second. */
export function calloutHTML(c: Callout, now: Date) {
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

