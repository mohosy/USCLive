/** HTML for a map callout bubble, shared by the Explore (Mapbox) and Satellite (Google 3D) views. */
import type { Callout } from "./callouts";
import { gameState, team } from "./games";
import { BUILDING_BY_ID } from "./campus";

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Inner HTML of a callout bubble. Games get their score/clock filled in separately every second. */
export function calloutHTML(c: Callout, now: Date) {
  // webcams: the 3D film camera is drawn by the map; this is just its name tag at the camera's feet
  if (c.kind === "webcam") {
    // a small live tile of what the camera sees; hover grows it, click opens the stream
    if (c.image) {
      const src = `${c.image}${c.image.includes("?") ? "&" : "?"}t=${Math.floor(+now / 60_000)}`;
      return `<div class="camt"><div class="camt-tile"><img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer"><span class="camt-live" title="Live"><i></i></span></div><div class="camt-name">${esc(c.title)}</div><div class="camt-hint">${esc(c.eyebrow)} · Click to watch</div></div>`;
    }
    return `<div class="cam-tag"><i></i>Live<span>${esc(c.title)}</span></div>`;
  }
  // DPS alerts: the 3D beacon is drawn by the map; this is its small tag (what happened shows on hover)
  if (c.kind === "alert" || c.kind === "alertmini") {
    // DPS: a white marker with a shield tinted by severity, how long ago, and (on hover) what happened
    const ago = c.eyebrow.replace(" min ago", "m").replace(" h ago", "h").replace(" days ago", "d").replace("just now", "now").replace("yesterday", "1d");
    return `<div class="dps dps-${c.severity ?? "medium"}"><span class="dps-ic"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2 4 5v6c0 5.25 3.4 9.8 8 11 4.6-1.2 8-5.75 8-11V5l-8-3z"/><path d="M11 7h2v6h-2zM11 15h2v2h-2z" fill="#fff"/></svg></span><span class="dps-t"><b>${esc(ago)}</b><span>${esc(c.title)}</span></span></div>`;
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
  if (c.kind === "schedule" && c.sched) return scheduleBanner(c);
  if (c.kind === "busy" || c.kind === "quiet") {
    return `<div class="bz bz-${c.kind}${c.stacked ? " bz-up" : ""}"><span class="bz-ic">${placeIcon(c.id)}</span><span class="bz-t"><b>${esc(c.eyebrow)}</b>${esc(c.title)}${c.meta ? ` · ${esc(c.meta)}` : ""}</span></div><div class="co-foot"></div>`;
  }
  const title = esc(c.title);
  const meta = c.meta ? esc(c.meta) : "";
  return `<div class="co-card">
    <div class="co-eyebrow">${esc(c.eyebrow)}</div>
    <div class="co-title">${title}</div>
    ${meta ? `<div class="co-meta">${meta}</div>` : ""}
    ${c.food ? `<div class="co-food">${esc(c.food)}</div>` : ""}
  </div><div class="co-stem"></div><div class="co-foot"></div>`;
}


// lucide "Users" (two people) and a fork, as inline SVG so the banner needs no React
const USERS = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
const FORK = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></svg>';
const SPARK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';

const BOOK = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>';
const CHAT = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

/** Your classes and office hours: the same mini ticket as events (blue stub), a fuller card on hover. */
function scheduleBanner(c: Callout) {
  const v = c.sched!;
  const label = v.kind === "class" ? "Class" : "Office hours";
  const icon = v.kind === "class" ? BOOK : CHAT;
  return `<div class="evb evb-soon sch">
    <div class="evb-mini evt">
      <span class="evt-img evt-noimg sch-stub">${icon}</span>
      <span class="evt-perf"></span>
      <span class="evt-body"><span class="evt-when">${v.live ? '<i class="evb-dot sch-dot"></i>' : ""}${esc(v.whenShort)} · ${esc(label)}</span><b class="evt-title">${esc(v.code)}</b></span>
      <span class="evt-tail"></span>
    </div>
    <div class="evb-card">
      <div class="evb-strip sch-strip"></div>
      <div class="evb-body">
        <div class="evb-when sch-when">${esc(label)} · ${esc(v.when)}</div>
        <div class="evb-title">${esc(v.code)}</div>
        <div class="evb-place">${esc(v.place)} · ${esc(v.room)}</div>
      </div>
    </div>
  </div><div class="co-foot"></div>`;
}

/** "Ethan is going", "Maya and 1 friend", "Maya and 2 friends" */
function friendsLine(f: { name: string }[]) {
  if (!f.length) return "";
  if (f.length === 1) return `${esc(f[0].name)} is going`;
  return `${esc(f[0].name)} and ${f.length - 1} friend${f.length > 2 ? "s" : ""}`;
}
function faces(f: { initials: string; photo?: string }[], max: number) {
  return f.slice(0, max).map((x) => (x.photo ? `<i class="ph" style="background-image:url('${esc(x.photo)}')"></i>` : `<i>${esc(x.initials)}</i>`)).join("") + (f.length > max ? `<i class="more">+${f.length - max}</i>` : "");
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
    <div class="evb-mini evt">
      ${v.photo ? `<span class="evt-img" style="background-image:url('${v.photo}')"></span>` : `<span class="evt-img evt-noimg" style="background-color:${v.color}">${SPARK}</span>`}
      <span class="evt-perf"></span>
      <span class="evt-body"><span class="evt-when">${v.state === "live" ? '<i class="evb-dot"></i>' : ""}${esc(v.whenShort)}${c.food ? `<em>${FORK}</em>` : ""}</span><b class="evt-title">${esc(short)}</b></span>
      ${v.friends.length ? `<span class="evb-faces evt-faces">${faces(v.friends, 2)}</span>` : ""}
      <span class="evt-tail"></span>
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

// what kind of place it is, at a glance: a barbell for gyms, waves for the pool, fork and knife for dining
const svg = (paths: string) => `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const DUMBBELL = svg('<path d="M14.4 14.4 9.6 9.6"/><path d="M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829z"/><path d="m21.5 21.5-1.4-1.4"/><path d="M3.9 3.9 2.5 2.5"/><path d="M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768-1.767a2 2 0 1 1-2.828-2.829l2.828-2.828a2 2 0 1 1 2.829 2.828l1.767-1.768a2 2 0 1 1 2.829 2.829z"/>');
const WAVES = svg('<path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>');
const UTENSILS = svg('<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>');
const LIBRARY = svg('<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>');
function placeIcon(calloutId: string) {
  const id = calloutId.startsWith("b:") ? calloutId.slice(2) : "";
  if (id === "uac") return WAVES;
  const kind = BUILDING_BY_ID[id]?.kind;
  return kind === "gym" ? DUMBBELL : kind === "dining" ? UTENSILS : kind === "library" ? LIBRARY : USERS;
}

