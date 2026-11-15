"use client";

import { AtSign, Check, Search, UserPlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client-types";
import { SCHOOLS } from "@/lib/campus";
import type { PersonView } from "@/app/api/users/route";
import { updateSavedSession } from "./SignIn";
import { Avatar, cx } from "./ui";

const schoolShort = (id: string) => SCHOOLS.find((s) => s.id === id)?.short ?? id;

type Home = { friends: PersonView[]; suggested: PersonView[]; incoming?: PersonView[] };
type FriendAction = "request" | "accept" | "decline" | "cancel" | "unfriend";

/**
 * Find people by @username or name and send them a friend request.
 * With no search: requests waiting for your answer, suggestions (most mutual friends first) and your friends.
 * `initialQuery` opens it already searching (a scanned QR code or a shared link: /?add=username).
 */
export default function FindFriends({ me, onClose, onChanged, initialQuery }: { me?: string; onClose: () => void; onChanged?: () => void; initialQuery?: string }) {
  const [q, setQ] = useState(initialQuery ?? "");
  const [results, setResults] = useState<PersonView[] | null>(null);
  const [home, setHome] = useState<Home | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0); // bumps after every change, so both lists reload
  const input = useRef<HTMLInputElement>(null);

  // no search: requests + suggestions + friends. Reloaded every few seconds while open, so an accepted request shows up.
  useEffect(() => {
    let live = true;
    const load = () => api<Home>("/api/users").then((r) => { if (live) setHome(r); }).catch(() => {});
    void load();
    const t = setInterval(load, 4000);
    return () => { live = false; clearInterval(t); };
  }, [version]);
  // search as you type (debounced)
  useEffect(() => {
    const term = q.trim().replace(/^@+/, "");
    let live = true;
    const t = setTimeout(() => {
      if (!term) { setResults(null); return; }
      api<{ results: PersonView[] }>(`/api/users?q=${encodeURIComponent(term)}`).then((r) => { if (live) setResults(r.results); }).catch(() => {});
    }, 180);
    return () => { live = false; clearTimeout(t); };
  }, [q, version]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function act(p: PersonView, action: FriendAction) {
    setBusy(p.id); setError(null);
    try {
      const r = await api<{ friendIds: string[] }>("/api/friends", { json: { userId: p.id, action } });
      updateSavedSession({ friendIds: r.friendIds }); // survives a demo-server restart
      onChanged?.();
    } catch (e) { setError((e as Error).message); }
    setVersion((v) => v + 1);
    setBusy(null);
  }

  const pill = "inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-50";
  const row = (p: PersonView) => (
    <li key={p.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface">
      <Avatar initials={p.avatar} photo={p.photo} size={42} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-semibold leading-tight">{p.name}</div>
        <div className="truncate text-[12.5px] text-muted">@{p.username}{p.major ? ` · ${p.major}` : ` · ${schoolShort(p.school)}`}</div>
        {/* friends: what you share; everyone else: who you both know */}
        {p.shared ? <div className="truncate text-[11.5px] font-medium text-foreground/70">{p.shared}</div>
          : p.mutualCount > 0 && (
            <div className="truncate text-[11.5px] text-muted">
              Friends with {p.mutualNames.join(" and ")}{p.mutualCount > p.mutualNames.length ? ` +${p.mutualCount - p.mutualNames.length}` : ""}
            </div>
          )}
      </div>
      {p.relation === "incoming" ? (
        <span className="flex shrink-0 gap-1.5">
          <button onClick={() => act(p, "accept")} disabled={busy === p.id} className={cx(pill, "bg-cardinal text-white hover:bg-cardinal-hover")}><Check size={14} /> Accept</button>
          <button onClick={() => act(p, "decline")} disabled={busy === p.id} className={cx(pill, "border border-line bg-white text-foreground hover:bg-surface")}>Decline</button>
        </span>
      ) : p.relation === "friends" ? (
        <button onClick={() => act(p, "unfriend")} disabled={busy === p.id} title="Unfriend" className={cx(pill, "group border border-line bg-white text-foreground hover:border-red-200 hover:text-red-700")}>
          <Check size={14} className="group-hover:hidden" /><X size={14} className="hidden group-hover:block" /><span className="group-hover:hidden">Friends</span><span className="hidden group-hover:inline">Unfriend</span>
        </button>
      ) : p.relation === "outgoing" ? (
        <button onClick={() => act(p, "cancel")} disabled={busy === p.id} title="Cancel the request" className={cx(pill, "group border border-line bg-white text-muted hover:text-foreground")}>
          <span className="group-hover:hidden">Requested</span><span className="hidden group-hover:inline">Cancel</span>
        </button>
      ) : (
        <button onClick={() => act(p, "request")} disabled={busy === p.id} title="Send a friend request" className={cx(pill, "bg-cardinal text-white hover:bg-cardinal-hover")}><UserPlus size={14} /> Add</button>
      )}
    </li>
  );

  const term = q.trim();
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/25 p-4 pt-[10vh] backdrop-blur-[2px]" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-label="Find friends" className="fade-in flex max-h-[78vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-2xl">
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <div>
            <div className="text-[17px] font-semibold">Find friends</div>
            {me && <div className="text-xs text-muted">You&apos;re <span className="font-medium text-foreground">@{me}</span>. Share it so friends can add you.</div>}
          </div>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-surface hover:text-foreground"><X size={16} /></button>
        </div>
        <div className="px-4 pb-2">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input ref={input} autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search @username or name"
              autoCapitalize="none" autoCorrect="off" spellCheck={false}
              className="w-full rounded-full border border-line bg-surface py-2.5 pl-9 pr-9 text-sm outline-none focus:border-foreground/30 focus:bg-white" />
            {q && <button onClick={() => { setQ(""); input.current?.focus(); }} aria-label="Clear search" className="absolute right-2.5 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full bg-foreground/15 text-white hover:bg-foreground/25"><X size={11} strokeWidth={3} /></button>}
          </div>
        </div>
        {error && <p role="alert" className="px-5 pb-1 text-[12.5px] font-medium text-red-700">{error}</p>}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {term ? (
            results === null ? <p className="px-3 py-6 text-center text-sm text-muted">Searching…</p>
              : results.length ? <ul>{results.map(row)}</ul>
              : <p className="px-3 py-8 text-center text-sm text-muted"><AtSign size={18} className="mx-auto mb-1.5 opacity-50" />No one matches “{term}”.<br />Check the spelling of their username.</p>
          ) : !home ? (
            <p className="px-3 py-6 text-center text-sm text-muted">Loading…</p>
          ) : (
            <>
              {!!home.incoming?.length && (
                <>
                  <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Requests · {home.incoming.length}</div>
                  <ul>{home.incoming.map(row)}</ul>
                </>
              )}
              {home.suggested.length > 0 && (
                <>
                  <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Suggested for you</div>
                  <ul>{home.suggested.map(row)}</ul>
                </>
              )}
              <div className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">Your friends · {home.friends.filter((f) => f.isFriend).length}</div>
              {home.friends.length ? <ul>{home.friends.map(row)}</ul> : <p className="px-3 py-3 text-sm text-muted">No friends yet. Search for someone&apos;s @username above.</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
