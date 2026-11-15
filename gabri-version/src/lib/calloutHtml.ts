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
  if (c.kind === "event" && c.ev) return eventBanner(c);
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


// lucide "Users" (two people) and a fork, as inline SVG so the banner needs no React
const USERS = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
const FORK = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></svg>';
const SPARK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';

/** "Ethan is going", "Maya and 1 friend", "Maya and 2 friends" */
function friendsLine(f: { name: string }[]) {
  if (!f.length) return "";
  if (f.length === 1) return `${esc(f[0].name)} is going`;
  return `${esc(f[0].name)} and ${f.length - 1} friend${f.length > 2 ? "s" : ""}`;
}
function faces(f: { initials: string }[], max: number) {
  return f.slice(0, max).map((x) => `<i>${esc(x.initials)}</i>`).join("") + (f.length > max ? `<i class="more">+${f.length - max}</i>` : "");
}

/** Events: a small photo ring on the map (friends' faces on its corner) that grows into a full card on hover. */
function eventBanner(c: Callout) {
  const v = c.ev!;
  const pic = v.photo
    ? `<span class="evb-img" style="background-image:url('${v.photo}')"></span>`
    : `<span class="evb-img evb-noimg" style="background-color:${v.color}">${SPARK}</span>`;
  const tags = `${v.state === "live" ? '<span class="evb-tag live"><i class="evb-dot"></i>Live</span>' : ""}${c.food ? `<span class="evb-tag food">${FORK}${esc(c.food)}</span>` : ""}`;
  const short = v.full.length > 22 ? `${v.full.slice(0, 21)}…` : v.full;
  return `<div class="evb evb-${v.state}">
    <div class="evb-mini">
      <div class="evb-ring">${pic}${v.friends.length ? `<span class="evb-faces">${faces(v.friends, 2)}</span>` : ""}${c.food ? `<span class="evb-food">${FORK}</span>` : ""}</div>
      <div class="evb-label"><b>${esc(short)}</b><span>${v.state === "live" ? '<i class="evb-dot"></i>' : ""}${esc(v.whenShort)}</span></div>
    </div>
    <div class="evb-card">
      ${v.photo ? `<div class="evb-photo" style="background-image:url('${v.photo}')"><div class="evb-tags">${tags}</div></div>` : `<div class="evb-strip" style="background:${v.color}"></div>`}
      <div class="evb-body">
        ${!v.photo && tags ? `<div class="evb-tags inline">${tags}</div>` : ""}
        <div class="evb-when">${esc(v.when)}</div>
        <div class="evb-title">${esc(v.full)}</div>
        <div class="evb-place">${esc(v.place)}</div>
        <div class="evb-going">${USERS}<span>${v.going} going</span>${v.friends.length ? `<span class="evb-faces sm">${faces(v.friends, 3)}</span><span class="evb-fr">${friendsLine(v.friends)}</span>` : ""}</div>
      </div>
    </div>
  </div><div class="co-foot"></div>`;
}
