"use client";

import { ArrowUp, ChevronDown, ChevronUp, Navigation, SquarePen } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, fmtWhen, type EventView } from "@/lib/client-types";
import { BUILDING_BY_ID } from "@/lib/campus";
import type { ChatAction } from "@/lib/agent";
import { cx } from "./ui";

interface Msg { role: "user" | "assistant"; content: string; eventIds?: string[]; actions?: ChatAction[] }
interface Reply { reply: string; actions: ChatAction[]; eventIds: string[]; ai: boolean }

const SUGGESTIONS = ["What's happening right now?", "Free food near me", "Invite Priya to pickup soccer", "Take me to Leavey", "Is the gym busy?", "What's due this week?"];

/**
 * The chat bar at the bottom of the map: ask anything, or tell it what to do (RSVP, invite friends, walk somewhere).
 * Replies can act on the map right away; events it mentions show up as cards you can open.
 */
export default function ChatDock({ events, loc, now, onAction, onAnswer, onChanged }: {
  events: EventView[]; loc: { lat: number; lng: number }; now: Date;
  onAction: (a: ChatAction) => void;
  /** the events the latest answer is about (highlighted on the map), or null to clear */
  onAnswer: (eventIds: string[] | null) => void;
  onChanged: () => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(true);
  const [focused, setFocused] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs, busy]);

  async function send(q: string) {
    const content = q.trim();
    if (!content || busy) return;
    const history: Msg[] = [...msgs, { role: "user", content }];
    setMsgs(history); setText(""); setOpen(true); setBusy(true);
    try {
      const r = await api<Reply>("/api/chat", { json: { messages: history.map(({ role, content, eventIds }) => ({ role, content, eventIds })), lat: loc.lat, lng: loc.lng } });
      setMsgs((m) => [...m, { role: "assistant", content: r.reply, eventIds: r.eventIds, actions: r.actions }]);
      r.actions.forEach(onAction);
      onAnswer(r.eventIds.length ? r.eventIds : null);
      onChanged();
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", content: (e as Error).message }]);
    }
    setBusy(false);
  }
  const byId = (id: string) => events.find((e) => e.id === id);
  const showThread = open && msgs.length > 0;

  return (
    <div className="chat-dock">
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
                {m.actions?.filter((a) => a.type === "walk").map((a) => a.type === "walk" && (
                  <button key={a.buildingId} type="button" onClick={() => onAction(a)} className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-[12.5px] font-medium hover:bg-surface">
                    <Navigation size={13} /> Walk to {BUILDING_BY_ID[a.buildingId]?.name}
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
        <div className="mb-2 flex flex-wrap justify-center gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => void send(s)} className="rounded-full bg-white/90 px-3 py-1.5 text-[12.5px] font-medium shadow-[0_0_0_0.5px_rgba(0,0,0,0.1),0_2px_8px_rgba(0,0,0,0.08)] hover:bg-white">{s}</button>
          ))}
        </div>
      )}
      <form className="chat-bar" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
        {msgs.length > 0 && !open && (
          <button type="button" onClick={() => setOpen(true)} title="Show the conversation" aria-label="Show the conversation" className="rounded-full p-1.5 text-muted hover:bg-surface hover:text-foreground"><ChevronUp size={18} /></button>
        )}
        <input value={text} onChange={(e) => setText(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          placeholder="Ask anything, or tell me what to do" aria-label="Ask the campus assistant" className="min-w-0 flex-1 bg-transparent px-3 text-[15px] outline-none placeholder:text-muted" />
        <button type="submit" disabled={busy || !text.trim()} aria-label="Send" className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-full", text.trim() ? "bg-cardinal text-white" : "bg-surface text-muted")}>
          <ArrowUp size={18} />
        </button>
      </form>
    </div>
  );
}
