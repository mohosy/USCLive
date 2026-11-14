"use client";

import { ArrowLeft, ArrowUpRight, Navigation } from "lucide-react";
import { HOST_LABEL, primaryAction } from "@/lib/eventActions";
import { useEffect, useState } from "react";
import { BUILDING_BY_ID, SCHOOLS, walkMinutes } from "@/lib/campus";
import { api, fmtTime, fmtWhen, isLive, type AppState, type EventView, type Hotspot, type Loc } from "@/lib/client-types";
import type { Building } from "@/lib/types";
import { EventRow } from "./EventsPanel";
import { Avatar, Button, CatLabel, LevelDot, Tag, cx } from "./ui";

const VIS_LABEL = { public: "Public", school: "School only", open: "Open invite, anyone can join", invite: "Invite only" } as const;
const SRC_LABEL: Record<string, string> = { flyer: "Added from a flyer", scrape: "Imported from usc.edu", brightspace: "From Brightspace", email: "From your email", calendar: "From your calendar" };

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

export function EventDetail({ ev, state, loc, onClose, onRsvp, onInvite, onOpenBuilding, onDirections }: {
  ev: EventView; state: AppState; loc: Loc; onClose: () => void; onRsvp: (id: string) => Promise<void>; onInvite: (id: string, userIds: string[]) => Promise<void>; onOpenBuilding: (id: string) => void;
  onDirections: (buildingId: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const now = new Date(state.now);
  const b = BUILDING_BY_ID[ev.buildingId];
  const h = state.hotspots.find((x) => x.buildingId === ev.buildingId);
  const walk = b ? walkMinutes(loc, b) : null;
  const canInvite = ev.host.id === state.me.id || (ev.visibility !== "invite" && ev.going);
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
        <Row label="Host">{ev.host.name} <span className="text-muted">· {HOST_LABEL[ev.host.kind]}</span></Row>
        <Row label="Who">{VIS_LABEL[ev.visibility]}{ev.course ? ` · ${ev.course}` : ""}{schools.length ? ` · ${schools.join(", ")}` : ""}</Row>
        {ev.freeFood && <Row label="Food">{ev.foodDetail ?? "Free food"}</Row>}
        <Row label="Going">{ev.attendeeCount}{ev.capacity ? ` of ${ev.capacity}` : ""}</Row>
        {h && <Row label="Crowd"><span className="inline-flex items-center gap-1.5 capitalize"><LevelDot level={h.level} />{h.level}</span></Row>}
      </div>

      {ev.friendsGoing.length > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <div className="flex -space-x-1.5">{ev.friendsGoing.map((f) => <Avatar key={f.id} initials={f.avatar} />)}</div>
          <span className="text-sm text-muted">{ev.friendsGoing.map((f) => f.name.split(" ")[0]).join(", ")}</span>
        </div>
      )}

      <div className="mt-5 flex gap-2">
        {action.kind === "link" ? (
          <a href={action.url} target="_blank" rel="noopener noreferrer" className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-foreground px-4 py-2.5 text-sm font-medium text-white hover:opacity-90">
            {action.label} <ArrowUpRight size={15} />
          </a>
        ) : (
          <Button className="flex-1 !rounded-full" variant={action.kind === "leave" ? "secondary" : "primary"} disabled={busy || action.kind === "full"} onClick={toggle}>
            {action.kind === "leave" ? "Going · Leave" : action.label}
          </Button>
        )}
        <Button variant="secondary" className="!rounded-full" onClick={() => onDirections(ev.buildingId)} aria-label="Directions"><Navigation size={14} /> Directions</Button>
        {canInvite && <Button variant="secondary" className="!rounded-full" onClick={() => setPicking((p) => !p)}>Invite</Button>}
      </div>
      {action.kind === "link" && ev.category !== "sports_watch" && (
        <button onClick={toggle} disabled={busy} className="mt-2 text-xs text-muted hover:text-foreground">{ev.going ? "Saved to your schedule · remove" : "Also save to my schedule"}</button>
      )}
      {picking && (
        <div className="mt-3 rounded-lg border border-line p-2">
          {state.me.friends.map((f) => (
            <label key={f.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface">
              <input type="checkbox" checked={sel.includes(f.id)} onChange={() => setSel((s) => (s.includes(f.id) ? s.filter((x) => x !== f.id) : [...s, f.id]))} />
              <span className="text-sm">{f.name}</span>
            </label>
          ))}
          <Button className="mt-2 w-full" disabled={!sel.length || busy} onClick={async () => { setBusy(true); await onInvite(ev.id, sel); setBusy(false); setPicking(false); setSel([]); }}>Send invites</Button>
        </div>
      )}

      <p className="mt-6 text-xs text-muted">
        {SRC_LABEL[ev.source] ? `${SRC_LABEL[ev.source]}. ` : ""}Passed safety review.
      </p>
    </div>
  );
}

interface BuildingRes { building: Building; hotspot?: Hotspot; curve: { hour: number; typical: number; today: number | null }[]; events: EventView[] }

export function BuildingDetail({ id, loc, now, tick, onClose, onOpenEvent }: { id: string; loc: Loc; now: Date; tick: number; onClose: () => void; onOpenEvent: (id: string) => void }) {
  const [data, setData] = useState<BuildingRes | null>(null);
  useEffect(() => { api<BuildingRes>(`/api/buildings/${id}`).then(setData).catch(() => {}); }, [id, tick]);
  const b = data?.building ?? BUILDING_BY_ID[id];
  const h = data?.hotspot;
  const max = data ? Math.max(...data.curve.map((c) => Math.max(c.typical, c.today ?? 0)), 1) : 1;
  const nowH = now.getHours();

  return (
    <div>
      <Back onClose={onClose} />
      <div className="text-xs font-medium text-muted">{b.code}</div>
      <h2 className="text-xl font-semibold">{b.name}</h2>
      <div className="text-sm text-muted">{walkMinutes(loc, b)} min walk</div>

      {h && (
        <div className="mt-5">
          <div className="flex items-baseline justify-between">
            <div className="flex items-center gap-1.5 text-sm font-medium capitalize"><LevelDot level={h.level} />{h.suppressed ? "Very quiet" : h.level}</div>
            <div className="text-xs text-muted">{h.suppressed ? "Fewer than 5 people" : `About ${h.count} people · ${h.ratio.toFixed(1)}x usual`}</div>
          </div>
          <div className="mt-3 flex h-20 items-end gap-[3px]">
            {data?.curve.slice(6).map((c) => (
              <div key={c.hour} className="relative h-full flex-1" title={`${c.hour}:00 · typical ${c.typical}${c.today != null ? ` · today ${c.today}` : ""}`}>
                <div className="absolute bottom-0 w-full rounded-sm bg-surface" style={{ height: `${(c.typical / max) * 100}%` }} />
                {c.today != null && <div className={cx("absolute bottom-0 left-[20%] w-[60%] rounded-sm", c.hour === nowH ? "bg-cardinal" : "bg-foreground/30")} style={{ height: `${(c.today / max) * 100}%` }} />}
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted"><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span></div>
          <div className="mt-1 text-[11px] text-muted">Light bars: typical. Dark bars: today.</div>
        </div>
      )}

      {b.studySpot && <p className="mt-4 text-sm text-muted">{b.studySpot.note}.</p>}

      <h3 className="mt-6 text-sm font-semibold">Events here</h3>
      <div className="-mx-2 mt-1">
        {data?.events.map((e) => <EventRow key={e.id} e={e} loc={loc} now={now} onOpen={() => onOpenEvent(e.id)} />)}
        {data && !data.events.length && <p className="px-2 py-3 text-sm text-muted">Nothing scheduled.</p>}
      </div>
    </div>
  );
}
