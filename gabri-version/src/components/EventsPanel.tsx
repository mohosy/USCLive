"use client";

import { CATEGORY_META, EVENT_TYPES, SCHOOLS, walkMinutes } from "@/lib/campus";
import { fmtWhen, isLive, type Category, type EventView, type Filters, type Loc } from "@/lib/client-types";
import type { SchoolId } from "@/lib/types";
import { Chip, Tag, cx, inputCls } from "./ui";

const CATS: Category[] = [...EVENT_TYPES];

export function EventRow({ e, loc, onOpen, now }: { e: EventView; loc: Loc; onOpen: () => void; now: Date }) {
  const color = (CATEGORY_META[e.category] ?? CATEGORY_META.student).color;
  const live = isLive(e, now);
  const walk = e.lat != null && e.lng != null ? walkMinutes(loc, { lat: e.lat, lng: e.lng }) : null;
  return (
    <button onClick={onOpen} className="flex w-full gap-3 rounded-md px-2 py-2.5 text-left hover:bg-surface">
      <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{e.title}</div>
        <div className="truncate text-xs text-muted">
          {fmtWhen(e.start, e.end, now)} · {e.buildingCode}{walk != null ? ` · ${walk} min walk` : ""}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {live && <Tag tone="live">Live</Tag>}
          {e.freeFood && <Tag tone="food">{e.foodDetail ?? "Free food"}</Tag>}
          {e.category === "community" && <Tag>Not USC-run</Tag>}
          {e.visibility === "open" && <Tag tone="open">Open invite</Tag>}
          {e.visibility === "invite" && <Tag tone="private">{e.invited ? "Invited" : "Private"}</Tag>}
          {e.isClassmate && <Tag tone="class">{e.course}</Tag>}
          {e.going && <Tag>Going</Tag>}
          {e.friendsGoing.length > 0 && <span className="text-[11px] text-muted">{e.friendsGoing.map((f) => f.name.split(" ")[0]).join(", ")} going</span>}
        </div>
      </div>
      <div className="shrink-0 text-right text-xs tabular-nums text-muted">{e.attendeeCount}</div>
    </button>
  );
}

export default function EventsPanel({ events, filters, setFilters, loc, onOpen, now }: {
  events: EventView[]; filters: Filters; setFilters: (f: Filters) => void; loc: Loc; onOpen: (id: string) => void; now: Date;
}) {
  const sorted = [...events].sort((a, b) => {
    const la = isLive(a, now) ? 0 : 1, lb = isLive(b, now) ? 0 : 1;
    return la - lb || +new Date(a.start) - +new Date(b.start);
  });
  return (
    <div className="flex h-full flex-col gap-3">
      <input className={inputCls} placeholder="Search events, buildings, classes" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
      <div className="flex rounded-lg border border-line p-0.5">
        {(["now", "today", "week"] as const).map((w) => (
          <button key={w} onClick={() => setFilters({ ...filters, window: w })} className={cx("flex-1 rounded-md py-1 text-xs font-medium", filters.window === w ? "bg-surface text-foreground" : "text-muted hover:text-foreground")}>
            {w === "now" ? "Next hour" : w === "today" ? "Today" : "This week"}
          </button>
        ))}
      </div>
      {/* one row: two quick toggles, then type and school as compact menus */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip active={filters.freeFood} onClick={() => setFilters({ ...filters, freeFood: !filters.freeFood })}>Free food</Chip>
        <Chip active={filters.friends} onClick={() => setFilters({ ...filters, friends: !filters.friends })}>Friends</Chip>
        <select aria-label="Event type" className={cx("pill-select", (filters.myClasses || filters.categories.length > 0) && "pill-select-on")}
          value={filters.myClasses ? "mine" : filters.categories[0] ?? "any"}
          onChange={(e) => {
            const v = e.target.value;
            setFilters({ ...filters, myClasses: v === "mine", categories: v === "any" || v === "mine" ? [] : [v as Category] });
          }}>
          <option value="any">Type</option>
          <option value="mine">My classes</option>
          {CATS.map((c) => <option key={c} value={c}>{CATEGORY_META[c].short}</option>)}
        </select>
        <select aria-label="School" className={cx("pill-select", filters.school !== "any" && "pill-select-on")} value={filters.school}
          onChange={(e) => setFilters({ ...filters, school: e.target.value as SchoolId | "any" })}>
          <option value="any">School</option>
          {SCHOOLS.filter((x) => x.id !== "all").map((x) => <option key={x.id} value={x.id}>{x.short ?? x.name}</option>)}
        </select>
      </div>
      <div className="text-xs text-muted">{sorted.length} event{sorted.length === 1 ? "" : "s"}</div>
      <div className="scroll-thin -mx-2 flex-1 overflow-y-auto">
        {sorted.map((e) => <EventRow key={e.id} e={e} loc={loc} onOpen={() => onOpen(e.id)} now={now} />)}
        {!sorted.length && <p className="py-10 text-center text-sm text-muted">No events match these filters.</p>}
      </div>
    </div>
  );
}
