"use client";

import { ArrowUp, ChevronDown, ChevronUp, LoaderCircle, MapPin, MessageCircle, Navigation, Search, SquarePen, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, fmtWhen, type EventView } from "@/lib/client-types";
import { BUILDING_BY_ID, BUILDINGS } from "@/lib/campus";
import type { ChatAction } from "@/lib/agent";

interface Msg { role: "user" | "assistant"; content: string; eventIds?: string[]; actions?: ChatAction[] }
interface Reply { reply: string; actions: ChatAction[]; eventIds: string[]; ai: boolean }

/** Things worth asking at this hour (all of them are questions the assistant's tools can answer). */
function hourPool(h: number): string[] {
  if (h >= 5 && h < 11) return ["What's my first class?", "Free breakfast anywhere?", "Quiet place to study now", "What's happening this morning?", "Is the gym busy?"];
  if (h >= 11 && h < 14) return ["Free lunch on campus?", "What's happening now?", "Is the gym busy?", "Where's quiet to study?", "What's next on my schedule?"];
  if (h >= 14 && h < 18) return ["Where can I study right now?", "Any games today?", "What's next on my schedule?", "Free food this afternoon?", "What's happening now?"];
  if (h >= 18 && h < 22) return ["What's happening tonight?", "Free food tonight?", "Any games tonight?", "Where's quiet to study tonight?", "Is Leavey busy?"];
  return ["Quiet places to study late", "Any safety alerts nearby?", "Take me to Leavey", "What's on tomorrow?", "Walk me to the Village"];
}

/** Three suggestions for right now: one from what is actually on (when something is), the rest from the hour; a new mix each time. */
function pickSuggestions(events: EventView[], now: Date): string[] {
  const t = now.getTime();
  const live = events.filter((e) => new Date(e.start).getTime() <= t && t < new Date(e.end).getTime());
  const soon = events
    .filter((e) => { const s = new Date(e.start).getTime(); return s > t && s - t < 3 * 3600_000; })
    .sort((a, b) => a.start.localeCompare(b.start));
  const fromData: string[] = [];
  if (live.some((e) => e.freeFood)) fromData.push("Where's the free food right now?");
  const mine = soon.find((e) => e.going);
  if (mine && mine.buildingName && mine.buildingName.length <= 22) fromData.push(`Take me to ${mine.buildingName}`);
  const next = soon.find((e) => e.title.length <= 24);
  if (next) fromData.push(`What's ${next.title}?`);
  const shuffle = <T,>(a: T[]) => a.map((v) => [Math.random(), v] as const).sort((x, y) => x[0] - y[0]).map(([, v]) => v);
  const pool = shuffle(hourPool(now.getHours()));
  const picked = [...shuffle(fromData).slice(0, 1), ...pool];
  return [...new Set(picked)].slice(0, 3);
}

/** Places whose name or code matches what is being typed (main buildings first), for the instant results. */
function placeMatches(raw: string) {
  const q = raw.trim().toLowerCase();
  if (q.length < 2) return [];
  const rank = (b: (typeof BUILDINGS)[number]) => {
    const name = b.name.toLowerCase(), code = b.code.toLowerCase();
    if (code === q || name === q) return 0;
    if (name.startsWith(q) || code.startsWith(q)) return 1;
    if (name.split(/\s+/).some((w) => w.startsWith(q))) return 2;
    return name.includes(q) ? 3 : -1;
  };
  return BUILDINGS.map((b) => ({ b, r: rank(b) })).filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || Number(!!a.b.minor) - Number(!!b.b.minor) || a.b.name.length - b.b.name.length)
    .slice(0, 5).map((x) => x.b);
}

/**
 * The one bar at the bottom of the map: search and assistant together.
 * Typing a place name lists matching places straight away; anything else (a question, or a request such as RSVP,
 * invite friends, walk somewhere) goes to the assistant. Replies can act on the map right away; events it
 * mentions show up as cards you can open.
 */
export default function ChatDock({ events, loc, now, onAction, onAnswer, onChanged, onOpenBuilding }: {
  /** the map-layer banner attached to the top of the bar (hidden while you're typing or chatting) */
  events: EventView[]; loc: { lat: number; lng: number }; now: Date;
  onAction: (a: ChatAction) => void;
  /** a place picked from the instant results */
  onOpenBuilding: (id: string) => void;
  /** the events the latest answer is about (highlighted on the map), or null to clear */
  onAnswer: (eventIds: string[] | null) => void;
  onChanged: () => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(true);
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]); // a fresh, time-aware mix every time the box opens
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs, busy]);
  // instant place results: rows are the matching places, then "ask the assistant" as the last row
  const places = useMemo(() => placeMatches(text), [text]);
  const [pick, setPick] = useState(0); // highlighted row
  const showPlaces = focused && places.length > 0;
  function openPlace(id: string) { setText(""); setPick(0); onOpenBuilding(id); }

  async function send(q: string) {
    const content = q.trim();
    if (!content || busy) return;
    const history: Msg[] = [...msgs, { role: "user", content }];
    setMsgs(history); setText(""); setPick(0); setOpen(true); setBusy(true);
    try {
      const r = await api<Reply>("/api/chat", { json: { messages: history.map(({ role, content, eventIds }) => ({ role, content, eventIds })), lat: loc.lat, lng: loc.lng } });
      setMsgs((m) => [...m, { role: "assistant", content: r.reply, eventIds: r.eventIds, actions: r.actions }]);
      r.actions.forEach(onAction);
      // a walk starts: fold the conversation away so it doesn't cover your Trojan and the route
      if (r.actions.some((a) => a.type === "walk" || a.type === "walk_point")) setOpen(false);
      onAnswer(r.eventIds.length ? r.eventIds : null);
      onChanged();
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", content: (e as Error).message }]);
    }
    setBusy(false);
  }
  const byId = (id: string) => events.find((e) => e.id === id);
  const showThread = open && msgs.length > 0 && !showPlaces;

  return (
    // compact until you use it: focusing, typing or an open conversation widens it to the full dock
    <div className={"campus-chat" + (focused || text || showThread || busy ? " campus-chat-open" : "")}>
      {showPlaces && (
        <div className="search-results scroll-thin" role="listbox" aria-label="Places and assistant">
          {places.map((b, i) => (
            <button key={b.id} type="button" role="option" aria-selected={pick === i} onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setPick(i)} onClick={() => openPlace(b.id)} className="search-row">
              <MapPin size={16} className="shrink-0 text-cardinal" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{b.name}</span>
              {!b.minor && <span className="shrink-0 text-xs text-muted">{b.code}</span>}
            </button>
          ))}
          <button type="button" role="option" aria-selected={pick === places.length} onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setPick(places.length)} onClick={() => void send(text)} className="search-row">
            <MessageCircle size={16} className="shrink-0 text-muted" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">Ask the assistant: &ldquo;{text.trim()}&rdquo;</span>
          </button>
        </div>
      )}
      {showThread && (
        <div className="chat-thread">
          <div className="flex items-center justify-between px-4 pb-1 pt-3">
            <span className="text-[12px] font-semibold uppercase tracking-wide text-muted">Assistant</span>
            <div className="flex gap-1">
              <button type="button" title="New chat" aria-label="New chat" onClick={() => { setMsgs([]); onAnswer(null); }} className="rounded-full p-1.5 text-muted hover:bg-surface hover:text-foreground"><SquarePen size={15} /></button>
              <button type="button" title="Hide" aria-label="Hide the conversation" onClick={() => setOpen(false)} className="rounded-full p-1.5 text-muted hover:bg-surface hover:text-foreground"><ChevronDown size={16} /></button>
            </div>
          </div>
          <div className="scroll-thin max-h-[46vh] space-y-3 overflow-y-auto px-4 pb-3">
            {msgs.map((m, i) => m.role === "user" ? (
              <div key={i} className="flex justify-end"><p className="max-w-[85%] rounded-2xl rounded-br-md bg-foreground px-3.5 py-2 text-[14px] text-white">{m.content}</p></div>
            ) : (
              <div key={i} className="max-w-[92%]">
                <p className="text-[14px] leading-relaxed">{m.content}</p>
                {!!m.eventIds?.length && (
                  <div className="mt-2 space-y-1.5">
                    {m.eventIds.map((id) => { const e = byId(id); return e ? (
                      <button key={id} type="button" onClick={() => onAction({ type: "open_event", eventId: id })} className="flex w-full items-center gap-3 rounded-xl border border-line bg-white px-3 py-2 text-left hover:bg-surface">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-semibold">{e.title}</span>
                          <span className="block truncate text-[12px] text-muted">{fmtWhen(e.start, e.end, now)} · {e.buildingName}{e.going ? " · Going" : ""}</span>
                        </span>
                        <span className="text-[12px] font-medium text-cardinal">Open</span>
                      </button>
                    ) : null; })}
                  </div>
                )}
                {m.actions?.map((a, k) => (a.type === "walk" || a.type === "walk_point") && (
                  <button key={k} type="button" onClick={() => { onAction(a); if (a.type === "walk" || a.type === "walk_point") setOpen(false); }} className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-[12.5px] font-medium hover:bg-surface">
                    <Navigation size={13} /> Walk to {a.type === "walk" ? BUILDING_BY_ID[a.buildingId]?.name : a.name}
                  </button>
                ))}
              </div>
            ))}
            {busy && <p className="text-[13px] text-muted">Thinking…</p>}
            <div ref={end} />
          </div>
        </div>
      )}
      {!showThread && focused && !text && msgs.length === 0 && (
        <div className="chat-suggestions">
          {suggestions.map((s) => (
            <button key={s} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => void send(s)} className="chat-suggestion">{s}</button>
          ))}
        </div>
      )}
      <form className="campus-search" role="search"
        onSubmit={(e) => { e.preventDefault(); if (showPlaces && pick < places.length) openPlace(places[pick].id); else void send(text); }}
        onKeyDown={(e) => {
          if (!showPlaces) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setPick((p) => (p + 1) % (places.length + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setPick((p) => (p + places.length) % (places.length + 1)); }
          else if (e.key === "Escape") { e.stopPropagation(); setText(""); setPick(0); }
        }}>
        <Search size={21} className="search-icon" aria-hidden="true" />
        <input value={text} onChange={(e) => { setText(e.target.value); setPick(0); }} onFocus={() => { setSuggestions(pickSuggestions(events, now)); setFocused(true); }} onBlur={() => setFocused(false)}
          placeholder="What do you want to do today?" aria-label="Search campus or ask the assistant" autoComplete="off" className="campus-search-input" />
        <div className="search-actions">
          {msgs.length > 0 && !open && (
            <button type="button" onClick={() => setOpen(true)} title="Show the conversation" aria-label="Show the conversation" className="icon-action"><ChevronUp size={18} /></button>
          )}
          {text && !busy && <button type="button" onClick={() => { setText(""); setPick(0); }} className="icon-action" aria-label="Clear"><X size={18} /></button>}
          <button type="submit" disabled={busy || !text.trim()} aria-label={busy ? "The assistant is thinking" : "Send"} className="search-submit">
            {busy ? <LoaderCircle size={19} className="animate-spin" /> : <ArrowUp size={21} />}
          </button>
        </div>
      </form>
    </div>
  );
}
