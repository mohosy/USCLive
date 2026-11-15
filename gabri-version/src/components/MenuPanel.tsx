"use client";

import { ChevronRight } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { BUILDING_BY_ID, walkMinutes } from "@/lib/campus";
import { fmtTime, isLive, type AppState, type Loc, type Notification } from "@/lib/client-types";
import { primaryAction } from "@/lib/eventActions";
import { gameState } from "@/lib/games";
import { LEVEL_COLOR } from "./ui";

const TRACKED = ["dining", "gym", "library", "student_center"];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-[#eeece8] py-3.5">
      <h3 className="mb-2 text-[12.5px] font-semibold text-[#77746d]">{title}</h3>
      {children}
    </section>
  );
}
const row = "flex w-full items-center gap-2.5 py-[7px] text-left text-[14.5px] hover:text-cardinal";
const empty = "py-1 text-[13px] text-[#77746d]";

function SportIcon({ sport }: { sport: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0 text-cardinal" aria-hidden="true">
      {sport === "football"
        ? <><ellipse cx="12" cy="12" rx="9" ry="5.5" transform="rotate(-35 12 12)" /><path d="M9.5 14.5l5-5M10.5 11l2.5 2.5M12 9.5l2.5 2.5" /></>
        : <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3v18M5.6 5.6c3 3 3 9.8 0 12.8M18.4 5.6c-3 3-3 9.8 0 12.8" /></>}
    </svg>
  );
}

/** The menu's overview: what is live, how busy it is, what is next for you. Every row flies the map there. */
export default function MenuPanel({ state, loc, onOpenEvent, onOpenBuilding, onAddEvent, onStudy, active = true, deadlines }: {
  state: AppState; loc: Loc; onOpenEvent: (id: string) => void; onOpenBuilding: (id: string) => void; onAddEvent: () => void; onStudy: () => void;
  /** the clock only ticks while the menu is open */
  active?: boolean;
  /** due dates from your calendars (Brightspace, Google), from the notification feed */
  deadlines?: Notification[];
}) {
  const [now, setNow] = useState(() => new Date(state.now));
  useEffect(() => { if (!active) return; const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, [active]); // game clocks tick

  const games = state.events.filter((e) => e.game && isLive(e, now));
  const busy = state.hotspots
    .filter((h) => !h.suppressed && BUILDING_BY_ID[h.buildingId] && TRACKED.includes(BUILDING_BY_ID[h.buildingId].kind))
    .map((h) => ({ h, b: BUILDING_BY_ID[h.buildingId], fill: Math.min(99, Math.round((h.count / BUILDING_BY_ID[h.buildingId].capacity) * 100)) }))
    .sort((x, y) => y.fill - x.fill).slice(0, 6);
  const next = state.me.today.filter((c) => +new Date(c.end) > +now).slice(0, 2);
  const events = state.events.filter((e) => !e.game && +new Date(e.end) > +now).sort((x, y) => +new Date(x.start) - +new Date(y.start)).slice(0, 3);
  // plan ahead: the next 7 days of due dates, and events you have to sign up / get tickets for before they fill
  const week = +now + 7 * 864e5;
  const comingUp = [
    ...state.events
      // only what needs action ahead of time: tickets / registration, or nearly full (drop-ins starting soon are under Events)
      .filter((e) => !e.game && !e.going && e.visibility !== "invite" && +new Date(e.start) > +now + 2 * 3600_000 && +new Date(e.start) < week
        && (!!e.link || (e.capacity != null && e.capacity - e.attendeeCount <= Math.max(5, e.capacity * 0.25))))
      .map((e) => ({ key: e.id, at: e.start, title: e.title, onClick: () => onOpenEvent(e.id),
        sub: `${e.link ? primaryAction(e).label : `${Math.max(0, (e.capacity ?? 0) - e.attendeeCount)} spots left`} · ${e.buildingName}`,
        urgent: !e.link && e.capacity != null && e.capacity - e.attendeeCount <= Math.max(5, e.capacity * 0.25) })),
    ...(deadlines ?? [])
      .filter((n) => n.dueAt && +new Date(n.dueAt) > +now && +new Date(n.dueAt) < week)
      .map((n) => ({ key: n.id, at: n.dueAt!, title: n.title, onClick: undefined as undefined | (() => void), sub: `Due · ${n.body}`, urgent: +new Date(n.dueAt!) - +now < 864e5 })),
  ].sort((a, b) => +new Date(a.at) - +new Date(b.at)).slice(0, 6);
  const day = (iso: string) => {
    const d = new Date(iso), t = new Date(now); const tm = new Date(now); tm.setDate(t.getDate() + 1);
    return d.toDateString() === t.toDateString() ? "Today" : d.toDateString() === tm.toDateString() ? "Tmrw" : d.toLocaleDateString("en-US", { weekday: "short" });
  };

  return (
    <div className="-my-2">
      <Section title="Live now">
        {games.length === 0 && <p className={empty}>No games right now.</p>}
        {games.map((e) => {
          const g = gameState(e.game!, e.start, now);
          return (
            <button key={e.id} className={row} onClick={() => onOpenEvent(e.id)}>
              <SportIcon sport={e.game!.sport} />
              <span className="min-w-0 flex-1 truncate font-semibold">{e.game!.home} {g.home} – {g.away} {e.game!.away}</span>
              <span className="whitespace-nowrap text-[13.5px] font-bold tabular-nums text-[#8a6700]">{g.period} {g.clock}</span>
            </button>
          );
        })}
      </Section>

      <Section title="Coming up">
        {comingUp.length === 0 && <p className={empty}>Nothing to sign up for or hand in this week.</p>}
        {comingUp.map((c) => {
          const Tag = c.onClick ? "button" : "div";
          return (
            <Tag key={c.key} className={row} onClick={c.onClick}>
              <span className="w-[62px] shrink-0 self-start pt-px text-[13px] font-bold tabular-nums text-cardinal">{day(c.at)}<small className="block text-[11.5px] font-medium text-[#77746d]">{fmtTime(c.at)}</small></span>
              <span className="min-w-0 flex-1 font-semibold">{c.title}
                <small className={`block text-[12.5px] font-normal ${c.urgent ? "text-[#b45309]" : "text-[#77746d]"}`}>{c.sub}</small>
              </span>
            </Tag>
          );
        })}
      </Section>

      <Section title="Busy now">
        {busy.map(({ h, b, fill }) => (
          <button key={b.id} className={row} onClick={() => onOpenBuilding(b.id)}>
            <span className="min-w-0 flex-1 truncate font-medium">{b.name}</span>
            <span className="h-[5px] w-[90px] shrink-0 overflow-hidden rounded-full bg-[#efede8]"><span className="block h-full rounded-full" style={{ width: `${fill}%`, background: LEVEL_COLOR[h.level] }} /></span>
            <span className="w-[38px] text-right text-[13.5px] tabular-nums text-[#555]">{fill}%</span>
          </button>
        ))}
      </Section>

      <Section title="Next for you">
        {next.length === 0 && <p className={empty}>Nothing else on your schedule today.</p>}
        {next.map((c) => (
          <button key={`${c.code}:${c.kind}`} className={row} onClick={() => onOpenBuilding(c.buildingId)}>
            <span className="w-[62px] shrink-0 self-start pt-px text-[13px] font-bold tabular-nums text-cardinal">{fmtTime(c.start)}</span>
            <span className="min-w-0 flex-1 font-semibold">{c.code}{c.kind === "office_hours" ? " office hours" : ""}
              <small className="block text-[12.5px] font-normal text-[#77746d]">{c.room}{BUILDING_BY_ID[c.buildingId] ? ` · ${walkMinutes(loc, BUILDING_BY_ID[c.buildingId])} min walk` : ""}</small>
            </span>
          </button>
        ))}
      </Section>

      <Section title="Events">
        {events.length === 0 && <p className={empty}>No more events today.</p>}
        {events.map((e) => (
          <button key={e.id} className={row} onClick={() => onOpenEvent(e.id)}>
            <span className="w-[62px] shrink-0 self-start pt-px text-[13px] font-bold tabular-nums text-cardinal">{isLive(e, now) ? "Now" : fmtTime(e.start)}</span>
            <span className="min-w-0 flex-1 font-semibold">{e.title}
              <small className="block text-[12.5px] font-normal text-[#77746d]">{e.buildingName} · {e.attendeeCount} going</small>
            </span>
          </button>
        ))}
      </Section>

      <section className="border-b border-[#eeece8] py-2">
        <button className={row} onClick={onStudy}>
          <span className="flex-1 font-semibold">Find a study room</span>
          <ChevronRight size={18} className="text-[#999]" />
        </button>
      </section>
    </div>
  );
}
