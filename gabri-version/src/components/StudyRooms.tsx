"use client";

import { ArrowLeft, ArrowUpRight, Check, Lock, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BUILDING_BY_ID, SCHOOLS, walkMinutes } from "@/lib/campus";
import { api, type Loc } from "@/lib/client-types";
import { findConflicts, type Busy } from "@/lib/conflicts";
import { bookingUrl, hourLabel, pickProblem, pickRange, tapSlot, type Availability, type Pick, type PlaceGroup, type Room } from "@/lib/studyRooms";
import { cx } from "./ui";

interface PlaceRow {
  id: string; name: string; letter: string; where: string; school: string | null; group: PlaceGroup; rooms: number; walk: number | null;
  dailyLimitHours: number; free: number | null; untilHour: number | null; nextHour?: number | null; source: "libcal" | "demo" | null;
}
interface Detail {
  place: { id: string; name: string; where: string; system: string; dailyLimitHours: number; buildingId: string | null; bookUrl: string; live: boolean };
  availability: Availability; today: string; hourNow: number; busy: Busy[];
}

const schoolShort = (id: string | null) => SCHOOLS.find((s) => s.id === id)?.short ?? "";
const walk = (a: string, b: string) => { const x = BUILDING_BY_ID[a], y = BUILDING_BY_ID[b]; return x && y ? walkMinutes(x, y) : null; };
/** the next seven days, starting from today (campus date) */
function week(today: string) {
  const start = Date.parse(`${today}T12:00:00Z`);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start + i * 86_400_000);
    return { date: d.toISOString().slice(0, 10), top: i === 0 ? "Today" : d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }), num: d.getUTCDate() };
  });
}

/** Bookable study rooms: the places you can book, then one place's day grid. USCLive only links to the official booking page. */
export default function StudyRooms({ loc }: { loc: Loc }) {
  const [list, setList] = useState<{ places: PlaceRow[]; school: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<PlaceRow | null>(null);
  useEffect(() => {
    let live = true;
    api<{ places: PlaceRow[]; school: string }>(`/api/study/rooms?lat=${loc.lat}&lng=${loc.lng}`).then((r) => { if (live) { setList(r); setFailed(false); } }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [loc.lat, loc.lng]);

  if (open) return <PlaceGrid row={open} onBack={() => setOpen(null)} />;
  if (failed) return <p className="py-6 text-center text-sm text-muted">The room list could not be loaded. Try again in a moment.</p>;
  if (!list) return <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-16" />)}</div>;

  const mine = list.places.filter((p) => p.group === "yours"), all = list.places.filter((p) => p.group === "open"), other = list.places.filter((p) => p.group === "locked");
  const school = schoolShort(list.school);
  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-muted">Rooms you can book{school && school !== "All" ? ` as a ${school} student` : ""}. USCLive shows what is free and opens the official booking page.</p>
      {mine.length > 0 && <Group title={`For you · ${school} only`}>{mine.map((p) => <PlaceCard key={p.id} p={p} mine onOpen={() => setOpen(p)} />)}</Group>}
      <Group title="Open to all students">{all.map((p) => <PlaceCard key={p.id} p={p} onOpen={() => setOpen(p)} />)}</Group>
      {other.length > 0 && <Group title="Other schools">{other.map((p) => <PlaceCard key={p.id} p={p} />)}</Group>}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function PlaceCard({ p, mine, onOpen }: { p: PlaceRow; mine?: boolean; onOpen?: () => void }) {
  const locked = p.group === "locked";
  const inner = (
    <>
      <span className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-semibold text-white", locked ? "bg-[#c7c7cc]" : mine ? "bg-cardinal" : "bg-[#2f6fde]")}>{p.letter}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="min-w-0 text-sm font-semibold leading-tight">{p.name}</span>
          {mine && <span className="shrink-0 rounded bg-cardinal/10 px-1.5 py-0.5 text-[10.5px] font-semibold text-cardinal">{schoolShort(p.school)}</span>}
          {locked && <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted"><Lock size={11} aria-hidden="true" />{schoolShort(p.school)} students</span>}
        </span>
        <span className="block truncate text-xs text-muted">
          {locked ? `Only ${schoolShort(p.school)} students can book these` : [p.where, `${p.rooms} room${p.rooms === 1 ? "" : "s"}`, p.walk != null ? `${p.walk} min` : null, p.source === "demo" ? "demo data" : null].filter(Boolean).join(" · ")}
        </span>
      </span>
      {!locked && (
        <span className="shrink-0 text-right">
          <span className={cx("block text-xs font-semibold tabular-nums", p.free ? "text-emerald-700" : "text-muted")}>{p.free ? `${p.free} free now` : "None free now"}</span>
          <span className="block text-[11px] text-muted">{p.free && p.untilHour != null ? `until ${hourLabel(p.untilHour)}` : p.nextHour != null ? `from ${hourLabel(p.nextHour)}` : "today"}</span>
        </span>
      )}
    </>
  );
  const cls = cx("flex w-full items-center gap-3 rounded-2xl border bg-white px-3 py-2.5 text-left", mine ? "border-cardinal/60" : "border-line");
  return locked ? <div className={cx(cls, "opacity-60")} aria-disabled="true">{inner}</div> : <button type="button" onClick={onOpen} className={cx(cls, "hover:bg-surface")}>{inner}</button>;
}

function PlaceGrid({ row, onBack }: { row: PlaceRow; onBack: () => void }) {
  const [date, setDate] = useState<string | null>(null);
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pick, setPick] = useState<Pick | null>(null);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => { setErr(null); setPick(null); }, 0);
    api<Detail>(`/api/study/rooms?place=${row.id}${date ? `&date=${date}` : ""}`).then((r) => { if (live) setD(r); }).catch((e) => { if (live) setErr((e as Error).message); });
    return () => { live = false; clearTimeout(t); };
  }, [row.id, date]);

  const av = d?.availability;
  const shown = date ?? d?.today ?? null;
  const loading = !d || (shown !== null && av?.date !== shown);
  const limit = d?.place.dailyLimitHours ?? row.dailyLimitHours;
  const isToday = !!d && av?.date === d.today;
  const room: Room | undefined = pick ? av?.rooms.find((r) => r.id === pick.roomId) : undefined;
  const problem = av && pick ? pickProblem(av, pick, limit) : null;
  // does the picked time clash with a class or an event you are going to that day?
  const conflicts = useMemo(() => {
    if (!d || !av || !pick) return [];
    const [y, m, dd] = av.date.split("-").map(Number);
    const at = (h: number) => new Date(y, m - 1, dd, h).toISOString();
    return findConflicts({ id: `room:${pick.roomId}`, start: at(pick.startHour), end: at(pick.startHour + pick.hours), buildingId: d.place.buildingId ?? undefined }, d.busy, walk);
  }, [d, av, pick]);

  return (
    <div>
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"><ArrowLeft size={14} aria-hidden="true" /> Bookable rooms</button>
      <h2 className="mt-2 text-lg font-semibold leading-tight">{row.name}</h2>
      <p className="text-xs text-muted">{[row.where, row.walk != null ? `${row.walk} min walk` : null].filter(Boolean).join(" · ")}</p>

      {d && (
        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Day">
          {week(d.today).map((w) => (
            <button key={w.date} type="button" aria-pressed={shown === w.date} onClick={() => setDate(w.date)}
              className={cx("min-w-[52px] flex-1 rounded-xl border px-1 py-1.5 text-center", shown === w.date ? "border-cardinal bg-cardinal text-white" : "border-line bg-white hover:bg-surface")}>
              <span className="block text-[11px]">{w.top}</span>
              <span className="block text-sm font-semibold tabular-nums">{w.num}</span>
            </button>
          ))}
        </div>
      )}

      {err ? <p role="alert" className="mt-4 text-sm font-medium text-red-700">{err}</p>
        : loading || !av ? <div className="mt-3 space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-9" />)}</div>
        : !av.hours.length ? <p className="mt-4 rounded-2xl border border-line bg-white px-3 py-6 text-center text-sm text-muted">No rooms can be booked on this day.</p>
        : (
          <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-white p-3">
            <table className="w-full border-separate border-spacing-x-1 border-spacing-y-1.5 text-left">
              <thead>
                <tr>
                  <th scope="col" className="w-[84px]"><span className="sr-only">Room</span></th>
                  {av.hours.map((h) => <th key={h} scope="col" className="text-[10.5px] font-normal tabular-nums text-muted">{h % 12 || 12}</th>)}
                </tr>
              </thead>
              <tbody>
                {av.rooms.map((r) => (
                  <tr key={r.id}>
                    <th scope="row" className="max-w-[84px] pr-1 align-middle font-normal">
                      {/* "1st Floor-110A" reads as room 110A, with the floor on the line under it */}
                      <span className="block truncate text-xs font-semibold" title={r.name}>{/^(.+ Floor)-(.+)$/i.exec(r.name)?.[2] ?? r.name}</span>
                      <span className="block truncate text-[10.5px] text-muted">{[/^(.+ Floor)-/i.exec(r.name)?.[1], r.seats ? `${r.seats} seats` : null, ...r.features].filter(Boolean).join(" · ") || "Room"}</span>
                    </th>
                    {av.hours.map((h) => {
                      const state = av.slots[r.id]?.[h];
                      const past = isToday && h < d!.hourNow;
                      const mine = !!pick && pick.roomId === r.id && h >= pick.startHour && h < pick.startHour + pick.hours;
                      const free = state === "free" && !past;
                      return (
                        <td key={h} className="p-0">
                          <button type="button" disabled={!free} onClick={() => setPick(tapSlot(av, pick, r.id, h, limit))}
                            aria-label={`${r.name}, ${hourLabel(h)}: ${mine ? "your pick" : free ? "free" : past ? "past" : "booked"}`} aria-pressed={mine}
                            className={cx("block h-7 w-full min-w-[22px] rounded-md", mine ? "bg-cardinal" : free ? "bg-emerald-100 hover:bg-emerald-200" : state === "booked" || past ? "bg-[#d9d9de]" : "bg-transparent")} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
              <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-emerald-100" /> Free</span>
              <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-[#d9d9de]" /> Booked</span>
              <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-cardinal" /> Your pick</span>
              <span className="ml-auto">{av.sourceLabel}</span>
            </div>
          </div>
        )}

      {d && av && !loading && av.hours.length > 0 && (
        <div className="mt-3 rounded-2xl border border-line bg-white p-3">
          {!pick || !room ? (
            <p className="text-sm text-muted">Tap a free slot to pick a time. You can hold a room for up to {limit} hours a day.</p>
          ) : (
            <>
              <div className="text-sm font-semibold">{room.name} · {isToday ? "Today" : new Date(`${av.date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })} {pickRange(pick)}</div>
              <div className="text-xs text-muted">{[room.seats ? `${room.seats} seats` : null, ...room.features, `${pick.hours} hour${pick.hours === 1 ? "" : "s"}${pick.hours === limit ? " (daily max)" : ""}`].filter(Boolean).join(" · ")}</div>
              {problem ? <p className="mt-1 text-xs font-medium text-red-700">{problem}</p>
                : conflicts.length ? conflicts.map((c, i) => <p key={i} className="mt-1 flex items-start gap-1.5 text-xs font-medium text-cardinal"><TriangleAlert size={13} className="mt-px shrink-0" aria-hidden="true" />{c.text}</p>)
                : <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-emerald-700"><Check size={13} aria-hidden="true" />No conflict with your schedule</p>}
              <a href={problem ? undefined : bookingUrl(d.place, room, av.date)}
                target="_blank" rel="noopener noreferrer" aria-disabled={!!problem}
                className={cx("mt-3 flex w-full items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-medium text-white", problem ? "pointer-events-none bg-cardinal/40" : "bg-cardinal hover:bg-cardinal-hover")}>
                Book on {d.place.system} <ArrowUpRight size={15} aria-hidden="true" />
              </a>
            </>
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            {d.place.live
              ? "Opens this room's official USC Libraries page on the day you picked; you choose the time and confirm there. USCLive does not book rooms."
              : `Opens ${d.place.system.replace(/'s system$/, "")}'s site. The rooms and times shown here are demo data; USCLive does not book rooms.`}
          </p>
        </div>
      )}
    </div>
  );
}
