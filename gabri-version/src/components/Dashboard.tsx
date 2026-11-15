"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CATEGORY_META } from "@/lib/campus";
import { api, fmtWhen, type AppState, type Org } from "@/lib/client-types";
import type { InsightsT } from "@/lib/ai";
import type { Moderation } from "@/lib/types";
import AddEventModal from "./AddEventModal";
import { Button, Tag, cx } from "./ui";

interface RegSummary { type: "native" | "handshake" | "engage" | "external"; registered: number; waitlisted: number; selfReported: number; cancelled: number; deadline: string | null; canManage: boolean }
interface RegRow { name: string; username: string; school: string; status: string; registeredAt: string }
const REG_SITE = { native: "One tap in USCLive", handshake: "On Handshake", engage: "On Engage", external: "On an official page" } as const;
const REG_STATUS: Record<string, string> = { registered: "Registered", waitlisted: "Waitlist", "self-reported": "Said they registered", cancelled: "Cancelled" };

/** One event's sign-ups: the three counts, and for its organizer the list and a CSV download. */
function RegistrationCard({ r, now }: { r: Row & { registration: RegSummary }; now: Date }) {
  const [list, setList] = useState<RegRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const reg = r.registration;
  async function toggle() {
    if (open) { setOpen(false); return; }
    setOpen(true); setErr(null);
    try { setList((await api<{ registrations: RegRow[] }>(`/api/events/${r.id}/registrations`)).registrations); }
    catch (e) { setErr((e as Error).message); }
  }
  return (
    <div className="rounded-lg border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{r.title}</div>
          <div className="truncate text-xs text-muted">{fmtWhen(r.start, r.end, now)} · {r.building} · {REG_SITE[reg.type]}{r.capacity ? ` · ${r.capacity} seats` : ""}</div>
        </div>
        <div className="flex items-center gap-4 text-right text-xs text-muted">
          {([["Registered", reg.registered], ["Waitlist", reg.waitlisted], ["Said they registered", reg.selfReported]] as const).map(([label, n]) => (
            <div key={label}><div className="text-lg font-semibold tabular-nums text-foreground">{n}</div>{label}</div>
          ))}
        </div>
      </div>
      {reg.canManage ? (
        <div className="mt-3 flex gap-2">
          <Button variant="secondary" className="!py-1 text-xs" onClick={toggle}>{open ? "Hide list" : "View list"}</Button>
          <a href={`/api/events/${r.id}/registrations?format=csv`} download className="inline-flex items-center justify-center rounded-lg border border-line px-3 py-1 text-xs font-medium hover:bg-surface">Export CSV</a>
        </div>
      ) : <p className="mt-2 text-xs text-muted">The list and the CSV are only for this event&apos;s organizer (a Student Creator account posting for {r.host}).</p>}
      {open && (
        <div className="scroll-thin mt-3 max-h-64 overflow-y-auto border-t border-line">
          {err && <p className="py-3 text-sm text-red-700">{err}</p>}
          {list?.map((x, i) => (
            <div key={i} className="flex items-center justify-between gap-3 border-b border-line py-1.5 text-sm last:border-b-0">
              <span className="min-w-0 truncate">{x.name}{x.username && <span className="ml-1.5 text-xs text-muted">@{x.username}</span>}</span>
              <span className="shrink-0 text-xs text-muted">{REG_STATUS[x.status] ?? x.status} · {new Date(x.registeredAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
            </div>
          ))}
          {list && !list.length && <p className="py-3 text-sm text-muted">Nobody has registered yet.</p>}
        </div>
      )}
    </div>
  );
}

interface Row { id: string; title: string; start: string; end: string; building: string; host: string; rsvps: number; registration: RegSummary | null; capacity: number | null; expected: number | null; measured: number | null; showRate: number | null; freeFood: boolean; category: string; status: "past" | "live" | "upcoming"; source: string }
interface Dash {
  org: Org; isUsg: boolean; orgs: Org[];
  totals: { events: number; rsvps: number; upcoming: number; live: number; avgShowRate: number | null; foodEvents: number };
  rows: Row[]; byCategory: { category: string; rsvps: number }[];
  queue: { id: string; title: string; description: string; host: string; building: string; start: string; moderation: Moderation }[];
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-line p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [orgId, setOrgId] = useState("org_usg");
  const [d, setD] = useState<Dash | null>(null);
  const [ins, setIns] = useState<InsightsT | null>(null);
  const [insBusy, setInsBusy] = useState(false);
  const [state, setState] = useState<AppState | null>(null);
  const [post, setPost] = useState(false);

  const load = useCallback(async () => setD(await api<Dash>(`/api/dashboard?org=${orgId}`)), [orgId]);
  useEffect(() => {
    const t = setTimeout(() => { load(); setIns(null); }, 0);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => { api<AppState>("/api/state").then(setState); }, []);

  async function insights() {
    setInsBusy(true);
    try { setIns((await api<{ insights: InsightsT }>("/api/dashboard/insights", { json: { orgId } })).insights); } finally { setInsBusy(false); }
  }
  async function decide(id: string, action: "approve" | "reject") {
    await api(`/api/moderation/${id}`, { json: { action } });
    load();
  }

  const now = d ? new Date() : new Date(0); // no clock reads during prerender
  const maxBar = d ? Math.max(1, ...d.rows.map((r) => Math.max(r.rsvps, r.expected ?? 0, r.measured ?? 0))) : 1;
  const maxCat = d ? Math.max(1, ...d.byCategory.map((c) => c.rsvps)) : 1;

  return (
    <div className="scroll-thin h-screen overflow-y-auto bg-white">
      <header className="flex h-14 items-center gap-4 border-b border-line px-6">
        <Link href="/" className="text-[17px] font-semibold tracking-tight">USC<span className="text-cardinal">Live</span></Link>
        <span className="text-sm text-muted">Organizers</span>
        <div className="ml-auto flex items-center gap-2">
          <select className="rounded-lg border border-line px-3 py-1.5 text-sm" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
            {(d?.orgs ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <Button onClick={() => setPost(true)}>Post an event</Button>
          <Link href="/" className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-surface">Back to map</Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-8">
        {!d ? <div className="skeleton h-96" /> : (
          <div className="space-y-8">
            <div>
              <h1 className="text-2xl font-semibold">{d.org.name}</h1>
              <p className="text-sm text-muted">{d.isUsg ? "All approved events on campus, plus the review queue." : `${d.org.members} members.`}</p>
            </div>

            <div className="grid grid-cols-5 gap-3">
              <Stat label="Events" value={d.totals.events} sub={`${d.totals.live} live, ${d.totals.upcoming} upcoming`} />
              <Stat label="RSVPs" value={d.totals.rsvps.toLocaleString()} />
              <Stat label="Show rate" value={d.totals.avgShowRate != null ? `${d.totals.avgShowRate}%` : "–"} sub="Measured turnout / RSVPs" />
              <Stat label="With free food" value={d.totals.foodEvents} />
              <Stat label="Waiting for review" value={d.queue.length} />
            </div>

            <div className="grid grid-cols-3 gap-6">
              <section className="col-span-2">
                <div className="mb-1 flex items-baseline justify-between">
                  <h2 className="text-sm font-semibold">Turnout by event</h2>
                  <div className="flex gap-3 text-xs text-muted">
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-gray-300" />Expected</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-gray-700" />RSVPs</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-cardinal" />Measured</span>
                  </div>
                </div>
                <p className="mb-4 text-xs text-muted">Measured turnout is the extra foot traffic in the building during the event, from anonymous aggregate counts. No one is tracked individually.</p>
                <div className="scroll-thin max-h-[440px] divide-y divide-line overflow-y-auto border-y border-line">
                  {d.rows.map((r) => (
                    <div key={r.id} className="grid grid-cols-[1fr_1.2fr] items-center gap-6 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{r.title}</span>
                          {r.status === "live" && <Tag tone="live">Live</Tag>}
                        </div>
                        <div className="truncate text-xs text-muted">{fmtWhen(r.start, r.end, now)} · {r.building}{d.isUsg ? ` · ${r.host}` : ""}</div>
                      </div>
                      <div className="space-y-1">
                        {([["bg-gray-300", r.expected], ["bg-gray-700", r.rsvps], ["bg-cardinal", r.measured]] as const).map(([cls, v], i) => (
                          <div key={i} className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 rounded-full bg-surface"><div className={cx("h-full rounded-full", cls)} style={{ width: `${((v ?? 0) / maxBar) * 100}%` }} /></div>
                            <div className="w-10 text-right text-xs tabular-nums text-muted">{v ?? "–"}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {!d.rows.length && <p className="py-8 text-center text-sm text-muted">No events yet.</p>}
                </div>
              </section>

              <div className="space-y-6">
                <section className="rounded-lg border border-line p-4">
                  <h2 className="text-sm font-semibold">Summary</h2>
                  {ins ? (
                    <div className="mt-2 space-y-2 text-sm">
                      <p>{ins.summary}</p>
                      <ul className="list-disc space-y-1 pl-4 text-muted">{ins.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
                      <p className="border-t border-line pt-2"><span className="font-medium">Next time: </span>{ins.recommendation}</p>
                    </div>
                  ) : <p className="mt-1 text-sm text-muted">A short write-up of what worked, based on RSVPs, turnout and timing.</p>}
                  <Button variant="secondary" className="mt-3 w-full" disabled={insBusy} onClick={insights}>{insBusy ? "Writing..." : ins ? "Regenerate" : "Generate summary"}</Button>
                </section>

                <section>
                  <h2 className="mb-3 text-sm font-semibold">RSVPs by category</h2>
                  <div className="space-y-2">
                    {d.byCategory.map((c) => (
                      <div key={c.category} className="flex items-center gap-2 text-xs">
                        <div className="w-20 truncate">{CATEGORY_META[c.category]?.label ?? c.category}</div>
                        <div className="h-1.5 flex-1 rounded-full bg-surface"><div className="h-full rounded-full" style={{ width: `${(c.rsvps / maxCat) * 100}%`, background: CATEGORY_META[c.category]?.color }} /></div>
                        <div className="w-10 text-right tabular-nums text-muted">{c.rsvps}</div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>

            <section>
              <h2 className="text-sm font-semibold">Registrations</h2>
              <p className="mb-3 text-xs text-muted">Events that take sign-ups. &ldquo;Said they registered&rdquo; counts students who told USCLive they signed up on Handshake, Engage or another official page; USCLive cannot check those.</p>
              <div className="space-y-3">
                {d.rows.filter((r): r is Row & { registration: RegSummary } => !!r.registration).map((r) => <RegistrationCard key={r.id} r={r} now={now} />)}
                {!d.rows.some((r) => r.registration) && <p className="py-6 text-center text-sm text-muted">No events with registration yet. Add one with &ldquo;Post event&rdquo;.</p>}
              </div>
            </section>

            <section>
              <h2 className="text-sm font-semibold">Review queue</h2>
              <p className="mb-3 text-xs text-muted">Student-posted events are screened automatically before they reach the map. Anything that might be unsafe or a scam waits here.</p>
              <div className="grid grid-cols-2 gap-3">
                {d.queue.map((q) => (
                  <div key={q.id} className="rounded-lg border border-line p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium">{q.title}</div>
                      <Tag tone={q.moderation.status === "rejected" ? "live" : "food"}>{q.moderation.status === "rejected" ? "Blocked" : "Needs review"}</Tag>
                    </div>
                    <div className="mt-0.5 text-xs text-muted">{q.host} · {q.building} · {fmtWhen(q.start, undefined, now)}</div>
                    <p className="mt-2 line-clamp-2 text-sm text-muted">{q.description}</p>
                    <ul className="mt-2 space-y-0.5 text-xs">{q.moderation.reasons.map((r, i) => <li key={i}>- {r}</li>)}</ul>
                    {d.isUsg && (
                      <div className="mt-3 flex gap-2">
                        <Button variant="secondary" className="!py-1 text-xs" onClick={() => decide(q.id, "approve")}>Approve</Button>
                        <Button variant="danger" className="!py-1 text-xs" onClick={() => decide(q.id, "reject")}>Reject</Button>
                      </div>
                    )}
                  </div>
                ))}
                {!d.queue.length && <p className="col-span-2 py-6 text-center text-sm text-muted">Nothing to review.</p>}
              </div>
            </section>
          </div>
        )}
      </div>
      {state && d && <AddEventModal open={post} onClose={() => setPost(false)} state={state} asOrg={{ id: d.org.id, name: d.org.name }} onCreated={() => load()} />}
    </div>
  );
}
