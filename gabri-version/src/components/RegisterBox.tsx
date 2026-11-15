"use client";

import { ArrowUpRight, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, fmtTime, type EventView } from "@/lib/client-types";
import { registrationSite } from "@/lib/registration";
import { Button, Tag } from "./ui";

type Reply = { status: string; event: EventView };
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

/**
 * The sign-up area of an event that takes registrations.
 * - native: one tap here (Register / Registered ✓ + Cancel / Join waitlist / Closed).
 * - Handshake, Engage or another official page: a button that opens that page in a new tab. USCLive cannot
 *   register anyone there, so when the student comes back it only asks "Did you register?" and records the answer.
 */
export default function RegisterBox({ ev, onUpdated }: { ev: EventView; onUpdated: (e: EventView) => void }) {
  const reg = ev.registration!;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [asking, setAsking] = useState(false); // "Did you register?" after coming back from the official page
  const away = useRef(false);
  const site = registrationSite(reg.type);

  // back from the official page (the tab or window is looked at again): ask once
  useEffect(() => {
    const back = () => { if (away.current && !document.hidden) { away.current = false; setAsking(true); } };
    window.addEventListener("focus", back);
    document.addEventListener("visibilitychange", back);
    return () => { window.removeEventListener("focus", back); document.removeEventListener("visibilitychange", back); };
  }, []);

  async function send(path: "register" | "self-report", init: RequestInit & { json?: unknown }) {
    setBusy(true); setErr(null);
    try { const r = await api<Reply>(`/api/events/${ev.id}/${path}`, init); onUpdated(r.event); setAsking(false); }
    catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }
  const register = () => send("register", { method: "POST" });
  const cancel = () => send("register", { method: "DELETE" });
  const confirm = () => send("self-report", { json: { confirmed: true } });
  function openOfficial() {
    away.current = true;
    // if the new tab never takes focus (blocked, or opened in the background), still ask after a moment
    setTimeout(() => { if (away.current && document.hasFocus()) { away.current = false; setAsking(true); } }, 2500);
  }

  const deadline = ev.registrationDeadline
    ? <p className="text-xs text-muted">{reg.closed ? "Registration closed" : "Registration closes"} {day(ev.registrationDeadline)}, {fmtTime(ev.registrationDeadline)}{reg.closesSoon && <span className="ml-1.5"><Tag tone="closing">Closes soon</Tag></span>}</p>
    : null;

  if (reg.type === "native") {
    return (
      <div className="space-y-2">
        {reg.status === "registered" ? (
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800"><Check size={15} /> Registered</div>
            <Button variant="secondary" className="whitespace-nowrap !rounded-full" disabled={busy} onClick={cancel}>Cancel</Button>
          </div>
        ) : reg.status === "waitlisted" ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 rounded-full bg-surface px-4 py-2.5 text-center text-sm font-medium">On the waitlist</div>
            <Button variant="secondary" className="whitespace-nowrap !rounded-full" disabled={busy} onClick={cancel}>Leave</Button>
          </div>
        ) : reg.closed ? (
          <Button className="w-full whitespace-nowrap !rounded-full" disabled>Closed</Button>
        ) : reg.spotsLeft === 0 ? (
          <Button className="w-full whitespace-nowrap !rounded-full" variant="secondary" disabled={busy} onClick={register}>Join waitlist{reg.waitlisted ? ` · ${reg.waitlisted} waiting` : ""}</Button>
        ) : (
          <Button className="w-full whitespace-nowrap !rounded-full" disabled={busy} onClick={register}>Register</Button>
        )}
        {reg.status === "registered" && <p className="text-xs text-muted">On your schedule. Friends see that you&apos;re going.</p>}
        {reg.status === "waitlisted" && <p className="text-xs text-muted">You&apos;ll get a notification if a spot opens up.</p>}
        {deadline}
        {ev.registrationUrl && <a href={ev.registrationUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground">Official page <ArrowUpRight size={12} /></a>}
        {err && <p role="alert" className="text-sm font-medium text-red-700">{err}</p>}
      </div>
    );
  }

  // Handshake / Engage / another official page
  return (
    <div className="space-y-2">
      {reg.status === "self-reported" ? (
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800"><Check size={15} /> You said you registered</div>
          <Button variant="secondary" className="whitespace-nowrap !rounded-full" disabled={busy} onClick={cancel}>Undo</Button>
        </div>
      ) : ev.registrationUrl ? (
        <a href={ev.registrationUrl} target="_blank" rel="noopener noreferrer" onClick={openOfficial}
          className="flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-foreground px-4 py-2.5 text-sm font-medium text-white hover:opacity-90">
          Register on {site} <ArrowUpRight size={15} />
        </a>
      ) : (
        <Button className="w-full whitespace-nowrap !rounded-full" variant="secondary" disabled={busy} onClick={() => setAsking(true)}>I registered on {site}</Button>
      )}
      {asking && reg.status !== "self-reported" && (
        <div className="rounded-xl border border-line bg-white p-3">
          <div className="text-sm font-medium">Did you register on {site}?</div>
          <p className="mt-0.5 text-xs text-muted">USCLive can&apos;t check this. Saying yes just adds it to your schedule.</p>
          <div className="mt-2 flex gap-2">
            <Button className="flex-1 whitespace-nowrap !rounded-full" disabled={busy} onClick={confirm}>Yes, I registered</Button>
            <Button className="flex-1 whitespace-nowrap !rounded-full" variant="secondary" disabled={busy} onClick={() => setAsking(false)}>Not yet</Button>
          </div>
        </div>
      )}
      {reg.status === "self-reported"
        ? <p className="text-xs text-muted">On your schedule. This is what you told us; your real registration is on {site}.</p>
        : <p className="text-xs text-muted">Opens {site} in a new tab. USCLive doesn&apos;t register you there.</p>}
      {deadline}
      {err && <p role="alert" className="text-sm font-medium text-red-700">{err}</p>}
    </div>
  );
}
