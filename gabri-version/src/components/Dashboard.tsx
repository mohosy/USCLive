"use client";

import Link from "next/link";
import { ChevronDown, ChevronLeft, Download, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CATEGORY_META } from "@/lib/campus";
import { api, fmtWhen, type AppState, type Org } from "@/lib/client-types";
import type { InsightsT } from "@/lib/ai";
import type { Moderation } from "@/lib/types";
import AddEventModal from "./AddEventModal";
import { OrgLogo } from "./Drawers";
import { cx } from "./ui";

interface RegSummary { type: "native" | "handshake" | "engage" | "external"; registered: number; waitlisted: number; selfReported: number; cancelled: number; deadline: string | null; canManage: boolean }
interface RegRow { name: string; username: string; school: string; status: string; registeredAt: string }
interface Row { id: string; title: string; start: string; end: string; building: string; host: string; rsvps: number; registration: RegSummary | null; capacity: number | null; expected: number | null; measured: number | null; showRate: number | null; freeFood: boolean; category: string; status: "past" | "live" | "upcoming"; source: string }
interface Dash {
  org: Org; isUsg: boolean; orgs: Org[];
  totals: { events: number; rsvps: number; upcoming: number; live: number; avgShowRate: number | null; foodEvents: number };
  rows: Row[]; byCategory: { category: string; rsvps: number }[];
  queue: { id: string; title: string; description: string; host: string; building: string; start: string; moderation: Moderation }[];
}

const REG_SITE = { native: "Sign-ups in USCLive", handshake: "Sign-ups on Handshake", engage: "Sign-ups on Engage", external: "Sign-ups on an official page" } as const;
const REG_STATUS: Record<string, string> = { registered: "Registered", waitlisted: "Waitlist", "self-reported": "Said they registered", cancelled: "Cancelled" };
type View = "upcoming" | "live" | "past" | "all";

const card = "rounded-2xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)]";

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className={cx(card, "px-5 py-4")}>
      <div className="text-[13px] text-muted">{label}</div>
      <div className="mt-1 text-[28px] font-semibold leading-none tracking-tight tabular-nums">{value}</div>
      {sub && <div className="mt-1.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

/** Who signed up: the list and a CSV, only for the event's organizer. */
function SignUps({ r }: { r: Row & { registration: RegSummary } }) {
  const [list, setList] = useState<RegRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const reg = r.registration;
  useEffect(() => {
    if (!reg.canManage) return;
    api<{ registrations: RegRow[] }>(`/api/events/${r.id}/registrations`).then((x) => setList(x.registrations)).catch((e) => setErr((e as Error).message));
  }, [r.id, reg.canManage]);
  return (
    <div className="mt-3 rounded-xl bg-[#f5f5f7] p-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
        <span className="text-muted">{REG_SITE[reg.type]}</span>
        <span><b className="tabular-nums">{reg.registered}</b> registered</span>
        {reg.waitlisted > 0 && <span><b className="tabular-nums">{reg.waitlisted}</b> waitlist</span>}
        {reg.selfReported > 0 && <span><b className="tabular-nums">{reg.selfReported}</b> said they registered</span>}
        {reg.canManage && (
          <a href={`/api/events/${r.id}/registrations?format=csv`} download className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium shadow-sm hover:bg-white/70">
            <Download size={13} /> CSV
          </a>
        )}
      </div>
      {!reg.canManage && <p className="mt-1.5 text-xs text-muted">Only {r.host} can see who signed up.</p>}
      {err && <p className="mt-2 text-sm text-red-700">{err}</p>}
      {list && (
        <div className="scroll-thin mt-2 max-h-56 overflow-y-auto">
          {list.map((x, i) => (
            <div key={i} className="flex items-center justify-between gap-3 border-t border-line py-1.5 text-sm first:border-t-0">
              <span className="min-w-0 truncate">{x.name}{x.username && <span className="ml-1.5 text-xs text-muted">@{x.username}</span>}</span>
              <span className="shrink-0 text-xs text-muted">{REG_STATUS[x.status] ?? x.status}</span>
            </div>
          ))}
          {!list.length && <p className="py-1 text-sm text-muted">Nobody has signed up yet.</p>}
        </div>
      )}
    </div>
  );
}

function EventRow({ r, now, showHost, max }: { r: Row; now: Date; showHost: boolean; max: number }) {
  const [open, setOpen] = useState(false);
  const d = new Date(r.start);
  const came = r.measured;
  return (
    <div className="px-5 py-3.5">
      <button type="button" onClick={() => r.registration && setOpen((o) => !o)} className={cx("flex w-full items-center gap-4 text-left", !r.registration && "cursor-default")}>
        <div className="w-11 shrink-0 text-center">
          <div className="text-[11px] font-medium uppercase text-cardinal">{d.toLocaleDateString("en-US", { month: "short" })}</div>
          <div className="text-xl font-semibold leading-tight tabular-nums">{d.getDate()}</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15px] font-medium">{r.title}</span>
            {r.status === "live" && <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">Live</span>}
          </div>
          <div className="truncate text-[13px] text-muted">{fmtWhen(r.start, r.end, now)} · {r.building}{showHost ? ` · ${r.host}` : ""}</div>
          {/* RSVPs in grey, who actually came in cardinal */}
          <div className="relative mt-2 h-1.5 max-w-[340px] overflow-hidden rounded-full bg-[#f0f0f2]">
            <div className="absolute inset-y-0 left-0 rounded-full bg-[#c7c7cc]" style={{ width: `${(r.rsvps / max) * 100}%` }} />
            {came != null && <div className="absolute inset-y-0 left-0 rounded-full bg-cardinal" style={{ width: `${(came / max) * 100}%` }} />}
          </div>
        </div>
        <div className={cx("w-16 shrink-0 text-right", came != null && "hidden sm:block")}>
          <div className="text-[15px] font-semibold tabular-nums">{r.rsvps.toLocaleString()}</div>
          <div className="text-xs text-muted">RSVPs</div>
        </div>
        {came != null && (
          <div className="w-20 shrink-0 text-right">
            <div className="text-[15px] font-semibold tabular-nums">{came.toLocaleString()}</div>
            <div className="text-xs text-muted">{r.showRate != null ? `came · ${r.showRate}%` : "came"}</div>
          </div>
        )}
        <ChevronDown size={16} className={cx("shrink-0 text-muted transition-transform", !r.registration && "invisible", open && "rotate-180")} />
      </button>
      {open && r.registration && <SignUps r={r as Row & { registration: RegSummary }} />}
    </div>
  );
}

export default function Dashboard() {
  const [orgId, setOrgId] = useState("org_usg");
  const [d, setD] = useState<Dash | null>(null);
  const [ins, setIns] = useState<InsightsT | null>(null);
  const [insBusy, setInsBusy] = useState(false);
  const [insErr, setInsErr] = useState<string | null>(null);
  const [state, setState] = useState<AppState | null>(null);
  const [post, setPost] = useState(false);
  const [view, setView] = useState<View>("upcoming");

  const load = useCallback(async () => setD(await api<Dash>(`/api/dashboard?org=${orgId}`)), [orgId]);
  useEffect(() => {
    const t = setTimeout(() => { load(); setIns(null); setInsErr(null); }, 0);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => { api<AppState>("/api/state").then(setState).catch(() => {}); }, []);

  async function insights() {
    setInsBusy(true); setInsErr(null);
    try { setIns((await api<{ insights: InsightsT }>("/api/dashboard/insights", { json: { orgId } })).insights); }
    catch (e) { setInsErr((e as Error).message); }
    finally { setInsBusy(false); }
  }
  async function decide(id: string, action: "approve" | "reject") {
    await api(`/api/moderation/${id}`, { json: { action } });
    load();
  }

  const now = d ? new Date() : new Date(0); // no clock reads during prerender
  const counts = useMemo(() => {
    const c = { upcoming: 0, live: 0, past: 0, all: d?.rows.length ?? 0 };
    d?.rows.forEach((r) => { c[r.status]++; });
    return c;
  }, [d]);
  const rows = useMemo(() => {
    if (!d) return [];
    const list = view === "all" ? d.rows : d.rows.filter((r) => r.status === view);
    return [...list].sort((a, b) => (view === "past" ? b.start.localeCompare(a.start) : a.start.localeCompare(b.start)));
  }, [d, view]);
  const max = Math.max(1, ...rows.map((r) => Math.max(r.rsvps, r.measured ?? 0)));
  const maxCat = d ? Math.max(1, ...d.byCategory.map((c) => c.rsvps)) : 1;

  return (
    <div className="scroll-thin h-dvh overflow-y-auto bg-[#f5f5f7] text-foreground">
      <header className="sticky top-0 z-10 border-b border-line bg-[#f5f5f7]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="-ml-2 inline-flex items-center gap-0.5 rounded-full px-2 py-1.5 text-sm font-medium text-cardinal hover:bg-black/5">
            <ChevronLeft size={18} /> Map
          </Link>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <select aria-label="Organization" className="pill-select max-w-[52vw] truncate !bg-white" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
              {(d?.orgs ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <button type="button" onClick={() => setPost(true)} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-cardinal px-3.5 py-1.5 text-sm font-medium text-white hover:bg-cardinal-hover">
              <Plus size={16} /> <span className="hidden sm:inline">Post an event</span><span className="sm:hidden">Post</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
        {!d ? <div className="skeleton h-96 rounded-2xl" /> : (
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <OrgLogo name={d.org.name} logo={d.org.logo} size={52} />
              <div className="min-w-0">
                <h1 className="truncate text-[26px] font-semibold tracking-tight">{d.org.name}</h1>
                <p className="text-sm text-muted">{d.isUsg ? "Every approved event on campus, and the review queue" : `${d.org.members.toLocaleString()} members`}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Events" value={d.totals.events} sub={`${d.totals.live} live · ${d.totals.upcoming} upcoming`} />
              <Stat label="RSVPs" value={d.totals.rsvps.toLocaleString()} sub={`${d.totals.foodEvents} with free food`} />
              <Stat label="Show rate" value={d.totals.avgShowRate != null ? `${d.totals.avgShowRate}%` : "–"} sub="Who came, of those who RSVPed" />
              <Stat label="Needs review" value={d.queue.length} sub={d.queue.length ? "Student posts held back" : "All clear"} />
            </div>

            <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
              <section className={cx(card, "min-w-0 overflow-hidden")}>
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-2 pt-4">
                  <h2 className="text-[17px] font-semibold">Events</h2>
                  <div className="flex rounded-full bg-[#f0f0f2] p-0.5 text-[13px]">
                    {(["upcoming", "live", "past", "all"] as const).map((v) => (
                      <button key={v} type="button" onClick={() => setView(v)}
                        className={cx("rounded-full px-3 py-1 capitalize transition", view === v ? "bg-white font-medium shadow-sm" : "text-muted hover:text-foreground")}>
                        {v} <span className="tabular-nums text-muted">{counts[v]}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-4 px-5 pb-2 text-xs text-muted">
                  <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#c7c7cc]" />RSVPs</span>
                  <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-cardinal" />Came</span>
                  <span className="hidden sm:inline">Turnout is counted from anonymous building foot traffic. Nobody is tracked.</span>
                </div>
                <div className="scroll-thin max-h-[620px] divide-y divide-line overflow-y-auto border-t border-line">
                  {rows.map((r) => <EventRow key={r.id} r={r} now={now} showHost={d.isUsg} max={max} />)}
                  {!rows.length && <p className="py-12 text-center text-sm text-muted">No {view === "all" ? "" : view + " "}events.</p>}
                </div>
              </section>

              <div className="space-y-5">
                <section className={cx(card, "p-5")}>
                  <h2 className="text-[17px] font-semibold">What worked</h2>
                  {ins ? (
                    <div className="mt-2 space-y-2.5 text-sm leading-relaxed">
                      <p>{ins.summary}</p>
                      <ul className="space-y-1.5 text-muted">{ins.bullets.map((b, i) => <li key={i} className="flex gap-2"><i className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted" />{b}</li>)}</ul>
                      <p className="rounded-xl bg-[#f5f5f7] p-3"><span className="font-medium">Next time: </span>{ins.recommendation}</p>
                    </div>
                  ) : <p className="mt-1 text-sm text-muted">A short read on RSVPs, turnout and timing across your events.</p>}
                  {insErr && <p className="mt-2 text-sm text-red-700">{insErr}</p>}
                  <button type="button" disabled={insBusy} onClick={insights}
                    className="mt-3 w-full rounded-full bg-[#f0f0f2] py-2 text-sm font-medium hover:bg-[#e8e8ed] disabled:opacity-60">
                    {insBusy ? "Writing…" : ins ? "Write it again" : "Write a summary"}
                  </button>
                </section>

                <section className={cx(card, "p-5")}>
                  <h2 className="mb-3 text-[17px] font-semibold">RSVPs by type</h2>
                  <div className="space-y-2.5">
                    {d.byCategory.map((c) => (
                      <div key={c.category} className="text-[13px]">
                        <div className="mb-1 flex justify-between"><span>{CATEGORY_META[c.category]?.label ?? c.category}</span><span className="tabular-nums text-muted">{c.rsvps.toLocaleString()}</span></div>
                        <div className="h-1.5 rounded-full bg-[#f0f0f2]"><div className="h-full rounded-full" style={{ width: `${(c.rsvps / maxCat) * 100}%`, background: CATEGORY_META[c.category]?.color }} /></div>
                      </div>
                    ))}
                    {!d.byCategory.length && <p className="text-sm text-muted">No RSVPs yet.</p>}
                  </div>
                </section>

                {(d.isUsg || d.queue.length > 0) && (
                  <section className={cx(card, "p-5")}>
                    <h2 className="text-[17px] font-semibold">Review queue</h2>
                    <p className="mt-0.5 text-[13px] text-muted">Student posts that might be unsafe or a scam wait here before reaching the map.</p>
                    <div className="mt-3 space-y-3">
                      {d.queue.map((q) => (
                        <div key={q.id} className="rounded-xl bg-[#f5f5f7] p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="text-sm font-medium">{q.title}</div>
                            <span className={cx("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", q.moderation.status === "rejected" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800")}>
                              {q.moderation.status === "rejected" ? "Blocked" : "Needs review"}
                            </span>
                          </div>
                          <div className="mt-0.5 text-xs text-muted">{q.host} · {q.building} · {fmtWhen(q.start, undefined, now)}</div>
                          {q.moderation.reasons.length > 0 && <p className="mt-1.5 text-xs">{q.moderation.reasons.join(" · ")}</p>}
                          {d.isUsg && (
                            <div className="mt-2.5 flex gap-2">
                              <button type="button" onClick={() => decide(q.id, "approve")} className="flex-1 rounded-full bg-white py-1.5 text-xs font-medium shadow-sm hover:bg-white/70">Approve</button>
                              <button type="button" onClick={() => decide(q.id, "reject")} className="flex-1 rounded-full bg-white py-1.5 text-xs font-medium text-red-700 shadow-sm hover:bg-white/70">Reject</button>
                            </div>
                          )}
                        </div>
                      ))}
                      {!d.queue.length && <p className="text-sm text-muted">Nothing to review.</p>}
                    </div>
                  </section>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
      {state && d && <AddEventModal open={post} onClose={() => setPost(false)} state={state} asOrg={{ id: d.org.id, name: d.org.name }} onCreated={() => load()} />}
    </div>
  );
}
