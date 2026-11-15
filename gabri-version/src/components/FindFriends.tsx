"use client";

import { AtSign, Check, Search, UserPlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client-types";
import { SCHOOLS } from "@/lib/campus";
import type { PersonView } from "@/app/api/users/route";
import { updateSavedSession } from "./SignIn";
import { Avatar, cx } from "./ui";

const schoolShort = (id: string) => SCHOOLS.find((s) => s.id === id)?.short ?? id;

/**
 * Find people by @username or name and add them as friends.
 * With no search: suggestions (most mutual friends first) and your current friends.
 */
export default function FindFriends({ me, onClose, onChanged }: { me?: string; onClose: () => void; onChanged?: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PersonView[] | null>(null);
  const [home, setHome] = useState<{ friends: PersonView[]; suggested: PersonView[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // no search: suggestions + friends (loaded once)
  useEffect(() => {
    let live = true;
    api<{ friends: PersonView[]; suggested: PersonView[] }>("/api/users").then((r) => { if (live) setHome(r); }).catch(() => {});
    return () => { live = false; };
  }, []);
  // search as you type (debounced)
  useEffect(() => {
    const term = q.trim().replace(/^@+/, "");
    let live = true;
    const t = setTimeout(() => {
      if (!term) { setResults(null); return; }
      api<{ results: PersonView[] }>(`/api/users?q=${encodeURIComponent(term)}`).then((r) => { if (live) setResults(r.results); }).catch(() => {});
    }, 180);
    return () => { live = false; clearTimeout(t); };
  }, [q]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function toggle(p: PersonView) {
    setBusy(p.id);
    try {
      const r = await api<{ friendIds: string[] }>("/api/friends", { method: p.isFriend ? "DELETE" : "POST", json: { userId: p.id } });
      const flip = (x: PersonView) => (x.id === p.id ? { ...x, isFriend: !p.isFriend } : x);
      setResults((rs) => rs?.map(flip) ?? null);
      setHome((h) => h && { friends: h.friends.map(flip), suggested: h.suggested.map(flip) });
      updateSavedSession({ friendIds: r.friendIds }); // survives a demo-server restart
      onChanged?.();
    } catch { /* keep the button as it was */ }
    setBusy(null);
  }

  const row = (p: PersonView) => (
    <li key={p.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface">
      <Avatar initials={p.avatar} photo={p.photo} size={42} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-semibold leading-tight">{p.name}</div>
        <div className="truncate text-[12.5px] text-muted">@{p.username}{p.major ? ` · ${p.major}` : ` · ${schoolShort(p.school)}`}</div>
        {p.mutualCount > 0 && (
          <div className="truncate text-[11.5px] text-muted">
            Friends with {p.mutualNames.join(" and ")}{p.mutualCount > p.mutualNames.length ? ` +${p.mutualCount - p.mutualNames.length}` : ""}
          </div>
        )}
      </div>
      <button onClick={() => toggle(p)} disabled={busy === p.id} title={p.isFriend ? "Remove friend" : "Add friend"}
        className={cx("group inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-50",
          p.isFriend ? "border border-line bg-white text-foreground hover:border-red-200 hover:text-red-700" : "bg-cardinal text-white hover:bg-cardinal-hover")}>
        {p.isFriend ? (
          <><Check size={14} className="group-hover:hidden" /><X size={14} className="hidden group-hover:block" /><span className="group-hover:hidden">Friends</span><span className="hidden group-hover:inline">Remove</span></>
        ) : (
          <><UserPlus size={14} /> Add</>
        )}
      </button>
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
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {term ? (
            results === null ? <p className="px-3 py-6 text-center text-sm text-muted">Searching…</p>
              : results.length ? <ul>{results.map(row)}</ul>
              : <p className="px-3 py-8 text-center text-sm text-muted"><AtSign size={18} className="mx-auto mb-1.5 opacity-50" />No one matches “{term}”.<br />Check the spelling of their username.</p>
          ) : !home ? (
            <p className="px-3 py-6 text-center text-sm text-muted">Loading…</p>
          ) : (
            <>
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
