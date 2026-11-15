/** HTML for a map callout bubble, shared by the Explore (Mapbox) and Satellite (Google 3D) views. */
import type { Callout } from "./callouts";
import { gameState, team } from "./games";

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Inner HTML of a callout bubble. Games get their score/clock filled in separately every second. */
export function calloutHTML(c: Callout, now: Date) {
  // webcams: the 3D film camera is drawn by the map; this is just its name tag at the camera's feet
  if (c.kind === "webcam") {
    return `<div class="cam-tag"><i></i>Live<span>${esc(c.title)}</span></div>`;
  }
  // DPS alerts: the 3D beacon is drawn by the map; this is its small tag (what happened shows on hover)
  if (c.kind === "alert" || c.kind === "alertmini") {
    return `<div class="al-tag al-${c.severity ?? "medium"}"><i></i>DPS · ${esc(c.eyebrow)}<span>${esc(c.title)}</span></div>`;
  }
  // live games: a small score pill (team badges + score); hovering shows the full card, clicking opens the side panel
  if (c.game) {
    const g = gameState(c.game.info, c.game.start, now);
    const badge = (abbr: string) => { const t = team(abbr); return `<span class="gm-badge" style="background:${t.bg};color:${t.fg}">${esc(abbr)}</span>`; };
    const [sport, venue] = c.eyebrow.split(" · ");
    return `<div class="co-card gm-pill">${badge(c.game.info.home)}<b>${g.home}</b><span class="gm-dash">–</span><b>${g.away}</b>${badge(c.game.info.away)}<span class="gm-period">${esc(g.period)}</span></div>
    <div class="gm-more">
      <div class="gm-top"><i></i>Live · ${esc(sport)}${venue ? ` · ${esc(venue)}` : ""}</div>
      <div class="gm-line">${badge(c.game.info.home)}<span>${esc(team(c.game.info.home).name)}</span><b>${g.home}</b></div>
      <div class="gm-line">${badge(c.game.info.away)}<span>${esc(team(c.game.info.away).name)}</span><b>${g.away}</b></div>
      <div class="gm-sub">${esc(g.period)}${g.clock ? ` · ${g.clock} left` : ""} · Click for details</div>
    </div><div class="co-stem"></div><div class="co-foot"></div>`;
  }
  const title = esc(c.title);
  const meta = c.meta ? esc(c.meta) : "";
  const dot = c.kind === "busy" ? "#ea580c" : c.kind === "quiet" ? "#16a34a" : "";
  return `<div class="co-card">
    <div class="co-eyebrow">${dot ? `<i style="background:${dot}" class=""></i>` : ""}${esc(c.eyebrow)}</div>
    <div class="co-title">${title}${meta && (c.kind === "busy" || c.kind === "quiet") ? ` <span class="co-meta">· ${meta}</span>` : ""}</div>
    ${meta && c.kind !== "busy" && c.kind !== "quiet" ? `<div class="co-meta">${meta}</div>` : ""}
    ${c.food ? `<div class="co-food">${esc(c.food)}</div>` : ""}
  </div><div class="co-stem"></div><div class="co-foot"></div>`;
}

