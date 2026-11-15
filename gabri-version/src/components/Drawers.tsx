"use client";

import { ArrowLeft, ArrowUpRight, Navigation, Send } from "lucide-react";
import { HOST_LABEL, primaryAction } from "@/lib/eventActions";
import { useEffect, useState } from "react";
import { BUILDING_BY_ID, SCHOOLS, walkMinutes } from "@/lib/campus";
import { api, fmtTime, fmtWhen, isLive, type AppState, type EventView, type Hotspot, type Loc } from "@/lib/client-types";
import type { Building } from "@/lib/types";
import { EventRow } from "./EventsPanel";
import SendSheet from "./SendSheet";
import { Avatar, Button, CatLabel, LevelDot, Tag, cx } from "./ui";

const VIS_LABEL = { public: "Public", school: "School only", open: "Open invite, anyone can join", invite: "Invite only" } as const;
const SRC_LABEL: Record<string, string> = { flyer: "Added from a flyer", scrape: "Imported from usc.edu", brightspace: "From Brightspace", email: "From your email", calendar: "From your calendar" };

/** "Maya", "Maya and Ryan", "Maya, Ryan and 2 others" */
function goingNames(n: string[]) {
  if (n.length <= 2) return n.join(" and ");
  if (n.length === 3) return `${n[0]}, ${n[1]} and ${n[2]}`;
  return `${n[0]}, ${n[1]} and ${n.length - 2} others`;
}

function Back({ onClose }: { onClose: () => void }) {
  return (
    <button onClick={onClose} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
      <ArrowLeft size={14} /> Back
    </button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5 text-sm">
      <div className="w-20 shrink-0 text-muted">{label}</div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export type HostRef = EventView["host"];

/** An org's real logo (from its EngageSC page or site); its initial when it has none. */
export function OrgLogo({ name, logo, size }: { name: string; logo?: string; size: number }) {
  const [broken, setBroken] = useState(false);
  if (logo && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logo} alt="" width={size} height={size} referrerPolicy="no-referrer" onError={() => setBroken(true)}
      className="shrink-0 rounded-xl border border-line bg-white object-contain" style={{ width: size, height: size }} />;
  }
  return <span className="grid shrink-0 place-items-center rounded-xl bg-surface font-semibold text-muted" style={{ width: size, height: size, fontSize: size * 0.42 }}>{name.slice(0, 1)}</span>;
}

/** A club, org, department or other host: who they are and everything they have on (opened from an event's Host line). */
export function OrgDetail({ host, state, loc, onClose, onOpenEvent }: { host: HostRef; state: AppState; loc: Loc; onClose: () => void; onOpenEvent: (id: string) => void }) {
  const now = new Date(state.now);
  const org = state.orgs.find((o) => (host.id && o.id === host.id) || o.name.toLowerCase() === host.name.toLowerCase());
  const same = (e: EventView) => (host.id && e.host.id === host.id) || e.host.name.toLowerCase() === host.name.toLowerCase();
  const all = state.events.filter(same).sort((a, b) => a.start.localeCompare(b.start));
  const upcoming = all.filter((e) => +new Date(e.end) > +now);
  const past = all.filter((e) => +new Date(e.end) <= +now).reverse();
  const school = org && org.school !== "all" ? SCHOOLS.find((x) => x.id === org.school)?.name : null;
  const kind = org ? (org.kind === "club" ? "Student org" : org.kind === "usg" ? "Student government" : "USC office") : HOST_LABEL[host.kind];
  const going = upcoming.reduce((n, e) => n + e.attendeeCount, 0);
  return (
    <div>
      <Back onClose={onClose} />
      <div className="flex items-center gap-3">
        <OrgLogo name={host.name} logo={org?.logo} size={48} />
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted">{kind}</div>
          <h2 className="mt-0.5 text-xl font-semibold leading-tight">{host.name}</h2>
        </div>
      </div>
      {org?.description && <p className="mt-3 text-sm leading-relaxed">{org.description}</p>}
      {org?.website && (
        <a href={org.website} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-cardinal hover:underline">
          {org.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}<ArrowUpRight size={13} aria-hidden="true" />
        </a>
      )}
      <p className="mt-2 text-sm text-muted">
        {[org?.members ? `${org.members.toLocaleString()} members` : null, school, upcoming.length ? `${upcoming.length} upcoming ${upcoming.length === 1 ? "event" : "events"}` : null, going ? `${going} going` : null].filter(Boolean).join(" · ")}
      </p>

      <h3 className="mt-6 text-sm font-semibold">Coming up</h3>
      <div className="-mx-2 mt-1">
        {upcoming.map((e) => <EventRow key={e.id} e={e} loc={loc} now={now} onOpen={() => onOpenEvent(e.id)} />)}
        {!upcoming.length && <p className="px-2 py-3 text-sm text-muted">Nothing else scheduled yet.</p>}
      </div>
      {past.length > 0 && (
        <>
          <h3 className="mt-5 text-sm font-semibold text-muted">Earlier</h3>
          <div className="-mx-2 mt-1 opacity-70">
            {past.slice(0, 5).map((e) => <EventRow key={e.id} e={e} loc={loc} now={now} onOpen={() => onOpenEvent(e.id)} />)}
          </div>
        </>
      )}
    </div>
  );
}

export function EventDetail({ ev, state, loc, onClose, onRsvp, onInvite, onFindFriends, onOpenBuilding, onDirections, onOpenHost, onCancel }: {
  ev: EventView; state: AppState; loc: Loc; onClose: () => void; onRsvp: (id: string) => Promise<void>; onInvite: (id: string, userIds: string[]) => Promise<void>; onFindFriends: () => void; onOpenBuilding: (id: string) => void;
  onDirections: (buildingId: string) => void;
  /** open the host's page (their other events) */
  onOpenHost?: (host: HostRef) => void;
  /** the host cancels their own event */
  onCancel?: (id: string) => Promise<void>;
}) {
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  // a different event closes the share sheet
  const [sheetFor, setSheetFor] = useState(ev.id);
  if (sheetFor !== ev.id) { setSheetFor(ev.id); setPicking(false); }
  const now = new Date(state.now);
  const b = BUILDING_BY_ID[ev.buildingId];
  const h = state.hotspots.find((x) => x.buildingId === ev.buildingId);
  const walk = b ? walkMinutes(loc, b) : null;
  // anyone can send an event to friends, except invite-only events (host only)
  const canSend = ev.host.id === state.me.id || ev.visibility !== "invite";
  const action = primaryAction(ev);
  const toggle = async () => { setBusy(true); await onRsvp(ev.id); setBusy(false); };
  const schools = ev.schools.filter((s) => s !== "all").map((s) => SCHOOLS.find((x) => x.id === s)?.short ?? s);

  return (
    <div>
      <Back onClose={onClose} />
      <div className="flex items-center gap-2"><CatLabel category={ev.category} />{isLive(ev, now) && <Tag tone="live">Live</Tag>}</div>
      <h2 className="mt-1.5 text-xl font-semibold leading-tight">{ev.title}</h2>
      {ev.description && <p className="mt-2 text-sm leading-relaxed text-muted">{ev.description}</p>}

      <div className="mt-4 border-t border-line pt-2">
        <Row label="When">{fmtWhen(ev.start, ev.end, now)} <span className="text-muted">({fmtTime(ev.start)} – {fmtTime(ev.end)})</span></Row>
        <Row label="Where"><button className="text-left hover:underline" onClick={() => onOpenBuilding(ev.buildingId)}>{ev.buildingName}{ev.room ? `, ${ev.room}` : ""}</button>{walk != null && <span className="text-muted"> · {walk} min walk</span>}</Row>
        <Row label="Host">
          {onOpenHost && ev.host.kind !== "user"
            ? <button className="inline-flex items-center gap-1.5 text-left font-medium hover:underline" onClick={() => onOpenHost(ev.host)}>
                {(() => { const o = state.orgs.find((x) => x.id === ev.host.id); return o?.logo ? <OrgLogo name={o.name} logo={o.logo} size={18} /> : null; })()}
                {ev.host.name}<ArrowUpRight size={13} className="text-muted" aria-hidden="true" />
              </button>
            : ev.host.name}
          <span className="text-muted"> · {HOST_LABEL[ev.host.kind]}</span>
        </Row>
        <Row label="Who">{VIS_LABEL[ev.visibility]}{ev.course ? ` · ${ev.course}` : ""}{schools.length ? ` · ${schools.join(", ")}` : ""}</Row>
        {ev.freeFood && <Row label="Food">{ev.foodDetail ?? "Free food"}</Row>}
        <Row label="Going">{ev.attendeeCount}{ev.capacity ? ` of ${ev.capacity}` : ""}</Row>
        {h && <Row label="Crowd"><span className="inline-flex items-center gap-1.5 capitalize"><LevelDot level={h.level} />{h.level}</span></Row>}
      </div>

      {ev.friendsGoing.length > 0 && (
        <div className="mt-3 flex items-center gap-2.5 rounded-xl bg-surface px-3 py-2">
          <div className="flex -space-x-1.5">{ev.friendsGoing.slice(0, 4).map((f) => <Avatar key={f.id} initials={f.avatar} photo={f.photo} size={26} />)}</div>
          <span className="text-sm"><span className="font-medium">{goingNames(ev.friendsGoing.map((f) => f.name.split(" ")[0]))}</span> <span className="text-muted">{ev.friendsGoing.length === 1 ? "is" : "are"} going</span></span>
        </div>
      )}

      {/* the main action gets its own row; directions and sharing sit underneath, so no label ever wraps */}
      <div className="mt-5 space-y-2">
        {action.kind === "link" ? (
          <a href={action.url} target="_blank" rel="noopener noreferrer" className="flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-foreground px-4 py-2.5 text-sm font-medium text-white hover:opacity-90">
            {action.label} <ArrowUpRight size={15} />
          </a>
        ) : (
          <Button className="w-full whitespace-nowrap !rounded-full" variant={action.kind === "leave" ? "secondary" : "primary"} disabled={busy || action.kind === "full"} onClick={toggle}>
            {action.kind === "leave" ? "Going · Leave" : action.label}
          </Button>
        )}
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1 whitespace-nowrap !rounded-full" onClick={() => onDirections(ev.buildingId)}><Navigation size={14} /> Directions</Button>
          {canSend && <Button variant="secondary" className={cx("flex-1 whitespace-nowrap !rounded-full", picking && "!bg-surface")} onClick={() => setPicking((p) => !p)} title="Send to friends or share a link"><Send size={14} /> Send</Button>}
        </div>
      </div>
      {action.kind === "link" && ev.category !== "sports_watch" && (
        <button onClick={toggle} disabled={busy} className="mt-2 text-xs text-muted hover:text-foreground">{ev.going ? "Saved to your schedule · remove" : "Also save to my schedule"}</button>
      )}
      {/* hosts can call it off: it leaves the map and everyone going or invited is told */}
      {onCancel && (ev.host.id === state.me.id || (ev.host.kind === "org" && !!ev.host.id && ev.host.id === state.me.creatorOrgId)) && (
        <button type="button" disabled={busy} className="mt-3 w-full rounded-full py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          onClick={async () => { if (!window.confirm("Cancel this event? Everyone going or invited will be told.")) return; setBusy(true); await onCancel(ev.id); setBusy(false); }}>
          Cancel event
        </button>
      )}
      {picking && <SendSheet key={ev.id} ev={ev} friends={state.me.friends} onSend={(ids) => onInvite(ev.id, ids)} onFindFriends={onFindFriends} onClose={() => setPicking(false)} />}

      {/* where it came from (flyer, usc.edu, email...), only when that's useful to know */}
      {SRC_LABEL[ev.source] && <p className="mt-6 text-xs text-muted">{SRC_LABEL[ev.source]}.</p>}
    </div>
  );
}

interface BuildingRes { building: Building; hotspot?: Hotspot; curve: { hour: number; typical: number; today: number | null }[]; events: EventView[] }

export function BuildingDetail({ id, loc, now, tick, onClose, onOpenEvent, onWalk }: { id: string; loc: Loc; now: Date; tick: number; onClose: () => void; onOpenEvent: (id: string) => void; onWalk?: (buildingId: string) => void }) {
  const [data, setData] = useState<BuildingRes | null>(null);
  // a slower answer for a building you already clicked away from must not overwrite the current one
  useEffect(() => {
    let current = true;
    api<BuildingRes>(`/api/buildings/${id}`).then((d) => { if (current) setData(d); }).catch(() => {});
    return () => { current = false; };
  }, [id, tick]);
  const mine = data?.building.id === id ? data : null; // never show the previous building's numbers
  const b = mine?.building ?? BUILDING_BY_ID[id];
  const h = mine?.hotspot;
  const max = mine ? Math.max(...mine.curve.map((c) => Math.max(c.typical, c.today ?? 0)), 1) : 1;
  const nowH = now.getHours();

  return (
    <div>
      <Back onClose={onClose} />
      <div className="text-xs font-medium text-muted">{b.code}</div>
      <h2 className="text-xl font-semibold">{b.name}</h2>
      <div className="mt-1 flex items-center gap-3">
        <span className="text-sm text-muted">{walkMinutes(loc, b)} min walk</span>
        {onWalk && loc.buildingId !== b.id && (
          <button type="button" onClick={() => onWalk(b.id)} className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
            <Navigation size={12} /> Take me there
          </button>
        )}
      </div>

      {h && (
        <div className="mt-5">
          <div className="flex items-baseline justify-between">
            <div className="flex items-center gap-1.5 text-sm font-medium capitalize"><LevelDot level={h.level} />{h.suppressed ? "Very quiet" : h.level}</div>
            <div className="text-xs text-muted">{h.suppressed ? "Fewer than 5 people" : `About ${h.count} people · ${h.ratio.toFixed(1)}x usual`}</div>
          </div>
          <div className="relative mt-3 h-20">
            {/* today so far: solid bars (this hour in cardinal) */}
            <div className="absolute inset-0 flex items-end gap-[3px]">
              {mine?.curve.slice(6).map((c) => (
                <div key={c.hour} className="relative h-full flex-1" title={`${c.hour}:00 · usually ${c.typical}${c.today != null ? ` · today ${c.today}` : ""}`}>
                  {c.today != null && <div className={cx("absolute bottom-0 left-[12%] w-[76%] rounded-sm", c.hour === nowH ? "bg-cardinal" : "bg-foreground/25")} style={{ height: `${(c.today / max) * 100}%` }} />}
                </div>
              ))}
            </div>
            {/* how busy it usually is: a dotted line through the day */}
            {mine && (() => {
              const pts = mine.curve.slice(6);
              const n = pts.length;
              const line = pts.map((c, i) => `${((i + 0.5) / n) * 100},${100 - (c.typical / max) * 100}`).join(" ");
              return (
                <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <polyline points={line} fill="none" stroke="#6e6e73" strokeWidth="1.6" strokeDasharray="1 3.2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                </svg>
              );
            })()}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted"><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span></div>
          <div className="mt-1 flex items-center gap-3 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1.5"><svg width="16" height="4" aria-hidden="true"><line x1="1" y1="2" x2="15" y2="2" stroke="#6e6e73" strokeWidth="1.6" strokeDasharray="1 3.2" strokeLinecap="round" /></svg> Usually</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-1.5 rounded-sm bg-foreground/25" /> Today</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-1.5 rounded-sm bg-cardinal" /> Now</span>
          </div>
        </div>
      )}

      {b.studySpot && <p className="mt-4 text-sm text-muted">{b.studySpot.note}.</p>}

      <h3 className="mt-6 text-sm font-semibold">Events here</h3>
      <div className="-mx-2 mt-1">
        {mine?.events.map((e) => <EventRow key={e.id} e={e} loc={loc} now={now} onOpen={() => onOpenEvent(e.id)} />)}
        {mine && !mine.events.length && <p className="px-2 py-3 text-sm text-muted">Nothing scheduled.</p>}
      </div>
    </div>
  );
}
