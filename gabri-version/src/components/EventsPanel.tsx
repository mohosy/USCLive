"use client";

import { CATEGORY_META, EVENT_TYPES, SCHOOLS, walkMinutes } from "@/lib/campus";
import { fmtWhen, isLive, type Category, type EventView, type Filters, type Loc } from "@/lib/client-types";
import type { SchoolId } from "@/lib/types";
import { Users } from "lucide-react";
import { Avatar, Chip, Tag, cx, inputCls } from "./ui";

const CATS: Category[] = [...EVENT_TYPES];

export function EventRow({ e, loc, onOpen, now }: { e: EventView; loc: Loc; onOpen: () => void; now: Date }) {
  const color = (CATEGORY_META[e.category] ?? CATEGORY_META.student).color;
  const live = isLive(e, now);
  const walk = e.lat != null && e.lng != null ? walkMinutes(loc, { lat: e.lat, lng: e.lng }) : null;
  // room left, for events with a limit you sign up for here (not ticketed games or outside links)
  const spotsLeft = e.registration ? e.registration.spotsLeft : e.capacity != null && !e.link && !e.game ? Math.max(0, e.capacity - e.attendeeCount) : null;
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
          {e.registration?.status === "registered" ? <Tag tone="open">Registered ✓</Tag> : e.registration?.status === "waitlisted" ? <Tag>Waitlisted</Tag> : e.going && <Tag>Going</Tag>}
          {e.registration?.closesSoon && !e.registration.status && <Tag tone="closing">Closes soon</Tag>}
        </div>
        {/* who is going: the count, friends' initials, and the room left when the event has a limit */}
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
          <Users size={12} aria-hidden="true" />
          <span className="tabular-nums">{e.attendeeCount} going</span>
          {e.friendsGoing.length > 0 && (
            <span className="flex -space-x-1" title={`${e.friendsGoing.map((f) => f.name.split(" ")[0]).join(", ")} ${e.friendsGoing.length === 1 ? "is" : "are"} going`}>
              {e.friendsGoing.slice(0, 3).map((f) => <Avatar key={f.id} initials={f.avatar} size={16} />)}
            </span>
          )}
          {spotsLeft != null && <span className={cx("tabular-nums", spotsLeft === 0 && "font-medium text-foreground")}>· {spotsLeft === 0 ? (e.registration?.type === "native" ? "Full · waitlist open" : "Full") : `${spotsLeft} spot${spotsLeft === 1 ? "" : "s"} left`}</span>}
        </div>
      </div>
    </button>
  );
}

export default function EventsPanel({ events, filters, setFilters, loc, onOpen, now }: {
  events: EventView[]; filters: Filters; setFilters: (f: Filters) => void; loc: Loc; onOpen: (id: string) => void; now: Date;
}) {
  const toggleCat = (c: Category) => setFilters({ ...filters, categories: filters.categories.includes(c) ? filters.categories.filter((x) => x !== c) : [...filters.categories, c] });
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
      <div className="flex flex-wrap gap-1.5">
        <Chip active={filters.freeFood} onClick={() => setFilters({ ...filters, freeFood: !filters.freeFood })}>Free food</Chip>
        <Chip active={filters.friends} onClick={() => setFilters({ ...filters, friends: !filters.friends })}>Friends going</Chip>
        <Chip active={filters.myClasses} onClick={() => setFilters({ ...filters, myClasses: !filters.myClasses })}>My classes</Chip>
        {CATS.map((c) => (
          <Chip key={c} active={filters.categories.includes(c)} onClick={() => toggleCat(c)}>{CATEGORY_META[c].short}</Chip>
        ))}
      </div>
      <select className={inputCls} value={filters.school} onChange={(e) => setFilters({ ...filters, school: e.target.value as SchoolId | "any" })}>
        <option value="any">All schools</option>
        {SCHOOLS.filter((s) => s.id !== "all").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <div className="text-xs text-muted">{sorted.length} event{sorted.length === 1 ? "" : "s"}</div>
      <div className="scroll-thin -mx-2 flex-1 overflow-y-auto">
        {sorted.map((e) => <EventRow key={e.id} e={e} loc={loc} onOpen={() => onOpen(e.id)} now={now} />)}
        {!sorted.length && <p className="py-10 text-center text-sm text-muted">No events match these filters.</p>}
      </div>
    </div>
  );
}
