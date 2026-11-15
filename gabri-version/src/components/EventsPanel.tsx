"use client";

import { CATEGORY_META, EVENT_TYPES, SCHOOLS, walkMinutes } from "@/lib/campus";
import { isLive, type Category, type EventView, type Filters, type Loc } from "@/lib/client-types";
import { groupEvents, registerBy, tileFor, whenLine, type Sport, type TileKind } from "@/lib/eventList";
import { gameState } from "@/lib/games";
import type { SchoolId } from "@/lib/types";
import { BookOpen, Briefcase, Trophy, Users, Utensils, Volleyball, Waves, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar, Chip, Tag, cx, inputCls } from "./ui";

const CATS: Category[] = [...EVENT_TYPES];

/** The tile on the left of every row: one color and icon per kind of event. */
const TILE: Record<TileKind, { bg: string; icon: LucideIcon; label: string }> = {
  sports: { bg: "#2f9e58", icon: Trophy, label: "Sports" },
  club: { bg: "#7a52d6", icon: Users, label: "Student event" },
  food: { bg: "#e87a2a", icon: Utensils, label: "Food" },
  academic: { bg: "#2f6fde", icon: BookOpen, label: "Academic" },
  career: { bg: "#990000", icon: Briefcase, label: "Career" },
};
/** A sport's own icon, where the icon library has one; every other sport gets the trophy. */
const SPORT_ICON: Partial<Record<Sport, LucideIcon>> = { volleyball: Volleyball, swim: Waves };
/** venues people call by a short name */
const PLACE: Record<string, string> = { COL: "Coliseum", GAL: "Galen" };

export function EventRow({ e, loc, onOpen, now }: { e: EventView; loc: Loc; onOpen: () => void; now: Date }) {
  const tile = tileFor(e);
  const { bg, label } = TILE[tile.kind];
  const Icon = (tile.sport && SPORT_ICON[tile.sport]) || TILE[tile.kind].icon;
  const walk = e.lat != null && e.lng != null ? walkMinutes(loc, { lat: e.lat, lng: e.lng }) : null;
  const place = PLACE[e.buildingCode] ?? e.buildingCode;
  // a game that is on: the score and the clock, right in the row
  const g = e.game && isLive(e, now) ? gameState(e.game, e.start, now) : null;
  const by = registerBy(e, now);
  const full = e.registration?.type === "native" && e.registration.spotsLeft === 0 && !e.registration.closed;
  const status = e.registration?.status === "registered" ? "Registered" : e.registration?.status === "waitlisted" ? "On the waitlist"
    : e.registration?.status === "self-reported" || e.going ? "Going" : e.visibility === "invite" ? (e.invited ? "Invited" : "Private") : full ? "Waitlist" : null;
  const friends = e.friendsGoing;
  return (
    <button onClick={onOpen} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white" style={{ background: bg }} title={label}>
        <Icon size={20} strokeWidth={2} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold leading-snug">{e.title}</div>
        <div className="flex min-w-0 items-center gap-1.5 text-[13px] leading-snug text-muted">
          {g ? (
            <span className="truncate">
              <b className="font-semibold tabular-nums text-foreground">{e.game!.home} {g.home} – {g.away}</b>{" · "}
              <span className="font-semibold tabular-nums text-amber-700">{g.final ? "Final" : `${g.period} ${g.clock}`}</span> · {place}
            </span>
          ) : (
            <span className="truncate">{place} · {whenLine(e, now)}{status ? ` · ${status}` : ""}</span>
          )}
          {e.freeFood && <span className="shrink-0"><Tag tone="food">{e.foodDetail ?? "Free food"}</Tag></span>}
          {by && <span className="shrink-0 font-semibold text-cardinal">{by}</span>}
          {e.conflict && <span className="shrink-0 font-semibold text-cardinal">{e.conflict}</span>}
        </div>
      </div>
      {/* friends who are going, and how far it is on foot */}
      <div className="flex shrink-0 flex-col items-end gap-1 self-stretch py-0.5">
        {friends.length > 0 ? (
          <span className="flex -space-x-1.5" title={`${friends.map((f) => f.name.split(" ")[0]).join(", ")} ${friends.length === 1 ? "is" : "are"} going`}>
            {friends.slice(0, 2).map((f) => <Avatar key={f.id} initials={f.avatar} photo={f.photo} size={22} />)}
          </span>
        ) : <span className="h-[22px]" aria-hidden="true" />}
        {walk != null && <span className="text-xs tabular-nums text-muted">{walk} min</span>}
      </div>
    </button>
  );
}

export default function EventsPanel({ events, filters, setFilters, loc, onOpen, now }: {
  events: EventView[]; filters: Filters; setFilters: (f: Filters) => void; loc: Loc; onOpen: (id: string) => void; now: Date;
}) {
  // sections instead of a "Live" pill on every row: what is on now, what starts within the hour, then the rest
  // while a game is on, the list keeps its own second-by-second clock so the score line stays current
  const liveGame = events.some((e) => e.game && isLive(e, now));
  const [clock, setClock] = useState<Date | null>(null);
  useEffect(() => {
    if (!liveGame) return;
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, [liveGame]);
  const at = liveGame && clock && +clock > +now ? clock : now;
  const groups = groupEvents(events, at);
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
      <div className="scroll-thin -mx-2 flex-1 overflow-y-auto">
        {groups.map((g) => (
          <section key={g.section} aria-label={g.label} className="pt-3 first:pt-0">
            <h3 className="flex items-center gap-1.5 px-2 pb-1 text-xs font-semibold text-muted">
              {g.section === "live" && <span className="h-1.5 w-1.5 rounded-full bg-red-600" aria-hidden="true" />}
              {g.label}
            </h3>
            {g.events.map((e) => <EventRow key={e.id} e={e} loc={loc} onOpen={() => onOpen(e.id)} now={at} />)}
          </section>
        ))}
        {!groups.length && <p className="py-10 text-center text-sm text-muted">No events match these filters.</p>}
      </div>
    </div>
  );
}
