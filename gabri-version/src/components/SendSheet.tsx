"use client";

import { Check, Link2, Mail, MessageCircle, Send, Share, X } from "lucide-react";
import { useState } from "react";
import { fmtWhen, type EventView, type MeView } from "@/lib/client-types";
import { Avatar, Button, cx } from "./ui";

type Friend = MeView["friends"][number];

const firstNames = (fs: Friend[]) => {
  const n = fs.map((f) => f.name.split(" ")[0]);
  return n.length <= 2 ? n.join(" and ") : `${n.slice(0, -1).join(", ")} and ${n.at(-1)}`;
};

/** iOS-style share sheet for an event: pick friends and send, or share a link anywhere. */
export default function SendSheet({ ev, friends, onSend, onClose }: {
  ev: EventView; friends: Friend[]; onSend: (userIds: string[]) => Promise<void>; onClose: () => void;
}) {
  const [sel, setSel] = useState<string[]>([]);
  const [sent, setSent] = useState<string[]>([]);
  const [last, setLast] = useState<Friend[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  const url = typeof window !== "undefined" ? `${window.location.origin}/?event=${encodeURIComponent(ev.id)}` : "";
  const blurb = `${ev.title} · ${fmtWhen(ev.start, ev.end)}${ev.buildingName ? ` at ${ev.buildingName}` : ""}`;
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const picked = friends.filter((f) => sel.includes(f.id));

  async function send() {
    setBusy(true); setErr("");
    try {
      await onSend(sel);
      setSent((s) => [...s, ...sel]);
      setLast(picked);
      setSel([]);
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }
  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ }
  }

  return (
    <div className="fade-in mt-3 rounded-2xl border border-line bg-white p-3 shadow-[0_6px_24px_rgba(0,0,0,0.08)]">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Send to friends</div>
        <button onClick={onClose} aria-label="Close" className="grid h-6 w-6 place-items-center rounded-full text-muted hover:bg-surface hover:text-foreground"><X size={14} /></button>
      </div>

      {friends.length ? (
        <div className="mt-3 grid grid-cols-5 gap-1">
          {friends.map((f) => {
            const on = sel.includes(f.id), done = sent.includes(f.id);
            return (
              <button key={f.id} disabled={done} aria-pressed={on}
                onClick={() => setSel((s) => (on ? s.filter((x) => x !== f.id) : [...s, f.id]))}
                className="group flex flex-col items-center gap-1 rounded-xl py-1.5 hover:bg-surface disabled:hover:bg-transparent">
                <span className={cx("relative rounded-full transition-shadow", on && "shadow-[0_0_0_2px_#fff,0_0_0_4px_var(--color-cardinal,#990000)]")}>
                  <Avatar initials={f.avatar} size={40} />
                  {(on || done) && (
                    <span className={cx("absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full text-white ring-2 ring-white", done ? "bg-[#34c759]" : "bg-cardinal")}>
                      <Check size={10} strokeWidth={3} />
                    </span>
                  )}
                </span>
                <span className={cx("max-w-full truncate text-[11px]", done ? "text-muted" : "text-foreground")}>{done ? "Sent" : f.name.split(" ")[0]}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted">Add friends to send them events. You can still share a link below.</p>
      )}

      {friends.length > 0 && (
        <Button className="mt-2 w-full !rounded-full" disabled={!sel.length || busy} onClick={send}>
          <Send size={14} /> {busy ? "Sending…" : sel.length ? `Send to ${firstNames(picked)}` : "Pick who to send to"}
        </Button>
      )}
      {last.length > 0 && !sel.length && (
        <div className="fade-in mt-2 flex items-center justify-center gap-1.5 text-xs text-[#248a3d]"><Check size={13} strokeWidth={2.5} /> Sent to {firstNames(last)}</div>
      )}
      {err && <div className="mt-2 text-center text-xs text-red-700">{err}</div>}

      <div className="mt-3 border-t border-line pt-3">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">Or share a link</div>
        <div className="grid grid-cols-4 gap-1">
          {[
            { key: "copy", label: copied ? "Copied" : "Copy link", icon: copied ? <Check size={16} /> : <Link2 size={16} />, onClick: copy },
            { key: "text", label: "Message", icon: <MessageCircle size={16} />, href: `sms:?&body=${encodeURIComponent(`${blurb} ${url}`)}` },
            { key: "mail", label: "Email", icon: <Mail size={16} />, href: `mailto:?subject=${encodeURIComponent(ev.title)}&body=${encodeURIComponent(`${blurb}\n\n${url}`)}` },
            ...(canNativeShare ? [{ key: "more", label: "More", icon: <Share size={16} />, onClick: () => { navigator.share({ title: ev.title, text: blurb, url }).catch(() => {}); } }] : []),
          ].map((a) => {
            const inner = (
              <>
                <span className={cx("grid h-9 w-9 place-items-center rounded-full bg-surface text-foreground", a.key === "copy" && copied && "bg-[#e8f8ec] text-[#248a3d]")}>{a.icon}</span>
                <span className="text-[11px] text-muted">{a.label}</span>
              </>
            );
            const cls = "flex flex-col items-center gap-1 rounded-xl py-1.5 hover:bg-surface";
            return "href" in a && a.href
              ? <a key={a.key} href={a.href} className={cls}>{inner}</a>
              : <button key={a.key} onClick={"onClick" in a ? a.onClick : undefined} className={cls}>{inner}</button>;
          })}
        </div>
      </div>
    </div>
  );
}
