"use client";

import { Bell, Inbox, LocateFixed, Plus, Search, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BUILDING_BY_ID, BUILDINGS, distanceMeters } from "@/lib/campus";
import { api, applyFilters, DEFAULT_FILTERS, type AppState, type EventView, type Filters, type Loc, type Notification } from "@/lib/client-types";
import { buildCallouts, type Callout, type ChipState } from "@/lib/callouts";
import { parseNavQuery } from "@/lib/nav";
import { WEBCAMS, type Webcam } from "@/lib/webcams";
import AlertDetail from "./AlertDetail";
import WebcamViewer from "./WebcamViewer";
import AddEventModal from "./AddEventModal";
import { BuildingDetail, EventDetail } from "./Drawers";
import EventsPanel from "./EventsPanel";
import InboxModal from "./InboxModal";
import type { Camera, MapLayers } from "./MapView";
import type { CameraBus } from "./Google3DView";
import NowPanel from "./NowPanel";
import StudyPanel from "./StudyPanel";
import { Avatar, Button, cx } from "./ui";

const Google3DView = dynamic(() => import("./Google3DView"), { ssr: false, loading: () => <div className="absolute inset-0 bg-surface" /> });
const MapView = dynamic(() => import("./MapView"), { ssr: false, loading: () => <div className="absolute inset-0 bg-surface" /> });

type Tab = "now" | "events" | "study";
const START_LOC: Loc = { lat: BUILDING_BY_ID.gin.lat, lng: BUILDING_BY_ID.gin.lng, label: "Ginsburg Hall", buildingId: "gin" };

interface AskRes { answer: string; eventIds: string[]; buildingIds: string[]; focusBuildingId: string; ai: boolean }

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [tab, setTab] = useState<Tab>("now");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [loc, setLoc] = useState<Loc>(START_LOC);
  const [layers, setLayers] = useState<MapLayers>({ events: true, hotspots: true, columns: false, places: false });
  const [view, setView] = useState<"map" | "3d">("map");
  const [chips, setChips] = useState<ChipState>({ games: true, busy: true, safety: true, schedule: true, events: true, webcams: true });
  const [selAlert, setSelAlert] = useState<string | null>(null);
  const [cam, setCam] = useState<Webcam | null>(null);
  const [satLoaded, setSatLoaded] = useState(false); // photoreal tiles loaded enough to show
  const [warmSat, setWarmSat] = useState(false); // start loading Satellite in the background (on hover)
  const threeReady = view === "3d" && satLoaded;
  const [flatGone, setFlatGone] = useState(false); // flat satellite placeholder removed after the fade
  const camera = useRef<Camera | null>(null); // shared so switching views keeps the same spot
  const [camBus] = useState<CameraBus>(() => ({ listeners: new Set() }));
  const [startCam, setStartCam] = useState<Camera | null>(null); // camera snapshot taken when switching views
  const [selEvent, setSelEvent] = useState<string | null>(null);
  const [selBuilding, setSelBuilding] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lng: number; zoom?: number; key: number } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [toasts, setToasts] = useState<Notification[]>([]);
  const [ask, setAsk] = useState("");
  const [askRes, setAskRes] = useState<AskRes | null>(null);
  const [askBusy, setAskBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [walk, setWalk] = useState<{ toId: string; key: number } | null>(null);
  const seenNotifs = useRef<Set<string> | null>(null);
  const focusSeq = useRef(0); // makes every fly-to a new object, even to the same spot

  function switchView(v: "map" | "3d") {
    if (v === view) return;
    setStartCam(camera.current);
    setFlatGone(false);
    if (v === "map") { setSatLoaded(false); setWarmSat(false); } // free the GPU when leaving Satellite
    else if (satLoaded) setTimeout(() => setFlatGone(true), 800); // pre-warmed: fade straight in
    setView(v);
  }
  const onFlatCamera = (c: Camera) => {
    camera.current = c;
    camBus.listeners.forEach((fn) => fn(c));
  };

  const refresh = useCallback(async () => {
    try { setState(await api<AppState>("/api/state")); setTick((t) => t + 1); } catch { /* keep last state */ }
  }, []);

  const pollNotifs = useCallback(async () => {
    try {
      const r = await api<{ notifications: Notification[]; unread: number }>("/api/notifications");
      setNotifs(r.notifications);
      if (!seenNotifs.current) seenNotifs.current = new Set(r.notifications.map((n) => n.id));
      else {
        const fresh = r.notifications.filter((n) => !seenNotifs.current!.has(n.id));
        fresh.forEach((n) => seenNotifs.current!.add(n.id));
        if (fresh.length) {
          setToasts((t) => [...fresh.slice(0, 2), ...t].slice(0, 3));
          fresh.forEach((n) => setTimeout(() => setToasts((t) => t.filter((x) => x.id !== n.id)), 6000));
          refresh();
        }
      }
    } catch { /* ignore */ }
  }, [refresh]);

  useEffect(() => {
    const first = setTimeout(() => { refresh(); pollNotifs(); }, 0);
    const a = setInterval(refresh, 20_000);
    const b = setInterval(pollNotifs, 8_000);
    return () => { clearTimeout(first); clearInterval(a); clearInterval(b); };
  }, [refresh, pollNotifs]);

  const now = useMemo(() => new Date(state?.now ?? 0), [state?.now]);
  const visible = useMemo(() => (state ? applyFilters(state.events, filters, now) : []), [state, filters, now]);
  const mapEvents = askRes ? state?.events.filter((e) => askRes.eventIds.includes(e.id) || visible.some((v) => v.id === e.id)) ?? [] : visible;
  const event = state?.events.find((e) => e.id === selEvent) ?? null;
  const openAlert = state?.alerts.find((a) => a.id === selAlert) ?? null;
  const callouts = useMemo(() => (state ? buildCallouts(state, chips, now) : []), [state, chips, now]);

  const openEvent = (id: string) => {
    const e = state?.events.find((x) => x.id === id);
    setSelBuilding(null); setSelEvent(id);
    if (e?.lat != null && e.lng != null) setFocus({ lat: e.lat, lng: e.lng, key: ++focusSeq.current });
  };
  const openBuilding = (id: string) => {
    const b = BUILDING_BY_ID[id];
    setSelEvent(null); setSelBuilding(id);
    if (b) setFocus({ lat: b.lat, lng: b.lng, key: ++focusSeq.current });
  };
  const closeDetail = () => { setSelEvent(null); setSelBuilding(null); setSelAlert(null); };
  function onCallout(c: Callout) {
    const [kind, id] = c.id.split(":");
    if (kind === "ev") openEvent(id);
    else if (kind === "b") openBuilding(id);
    else if (kind === "al") { setSelEvent(null); setSelBuilding(null); setSelAlert(id); setFocus({ lat: c.lat, lng: c.lng, zoom: 17.2, key: ++focusSeq.current }); }
    else if (kind === "cam") setCam(WEBCAMS.find((w) => w.id === id) ?? null);
  }

  async function rsvp(id: string) {
    try {
      const r = await api<{ event: EventView }>(`/api/events/${id}/rsvp`, { method: "POST" });
      setState((s) => (s ? { ...s, events: s.events.map((e) => (e.id === id ? r.event : e)) } : s));
    } catch (e) { alert((e as Error).message); }
  }
  async function invite(id: string, userIds: string[]) {
    const r = await api<{ event: EventView }>(`/api/events/${id}/invite`, { json: { userIds } });
    setState((s) => (s ? { ...s, events: s.events.map((e) => (e.id === id ? r.event : e)) } : s));
  }
  async function runAsk(q: string) {
    if (q.trim().length < 2) return;
    // "how do I get to THH" -> animated 3D walk instead of a text answer
    const nav = parseNavQuery(q);
    if (nav) {
      const none = { eventIds: [], buildingIds: [], focusBuildingId: "none", ai: false };
      if (!nav.buildingId) { setAskRes({ ...none, answer: "Which building? Try a name or code, like Taper Hall (THH), Leavey (LVL) or SGM." }); return; }
      if (nav.buildingId === loc.buildingId) { setAskRes({ ...none, answer: `You're already at ${BUILDING_BY_ID[nav.buildingId].name}.` }); return; }
      setAskRes(null);
      setSelEvent(null);
      setSelBuilding(null);
      setWalk({ toId: nav.buildingId, key: ++focusSeq.current }); // plays in whichever view is open (Map or 3D)
      return;
    }
    setAskBusy(true);
    try {
      const r = await api<AskRes>("/api/ai/ask", { json: { question: q, lat: loc.lat, lng: loc.lng } });
      setAskRes(r);
      const b = r.focusBuildingId !== "none" ? BUILDING_BY_ID[r.focusBuildingId] : r.buildingIds[0] ? BUILDING_BY_ID[r.buildingIds[0]] : null;
      if (b) setFocus({ lat: b.lat, lng: b.lng, zoom: 16.6, key: ++focusSeq.current });
    } catch (e) { setAskRes({ answer: (e as Error).message, eventIds: [], buildingIds: [], focusBuildingId: "none", ai: false }); }
    setAskBusy(false);
  }
  function useGps() {
    navigator.geolocation?.getCurrentPosition((p) => {
      const here = { lat: p.coords.latitude, lng: p.coords.longitude };
      const nearest = [...BUILDINGS].sort((a, b) => distanceMeters(here, a) - distanceMeters(here, b))[0];
      if (distanceMeters(here, nearest) > 1500) { alert("You're off campus, so the demo location is kept."); return; }
      setLoc({ ...here, label: `near ${nearest.name}`, buildingId: nearest.id });
    }, () => alert("Location unavailable"));
  }
  async function markAllRead() {
    await api("/api/notifications", { json: { all: true } });
    setNotifs((n) => n.map((x) => ({ ...x, read: true })));
  }

  const unread = notifs.filter((n) => !n.read).length;
  const detailOpen = !!(event || selBuilding || openAlert);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white">
      {/* Header */}
      <header className="z-30 flex h-14 shrink-0 items-center gap-4 border-b border-line px-4">
        <Link href="/" className="w-[340px] shrink-0 text-[17px] font-semibold tracking-tight">
          USC<span className="text-cardinal">Live</span>
        </Link>

        <form className="relative max-w-xl flex-1" onSubmit={(e) => { e.preventDefault(); runAsk(ask); }}>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="Ask about campus, e.g. how do I get to THH, free food near me" className="h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-16 text-sm outline-none focus:border-foreground/30 focus:bg-white" />
          {askRes ? (
            <button type="button" onClick={() => { setAskRes(null); setAsk(""); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-foreground" aria-label="Clear"><X size={14} /></button>
          ) : askBusy ? <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">Searching</span> : null}
          {askRes && (
            <div className="fade-in absolute left-0 right-0 top-11 z-40 rounded-lg border border-line bg-white p-4 shadow-lg">
              <p className="text-sm leading-relaxed">{askRes.answer}</p>
              {(askRes.eventIds.length > 0 || askRes.buildingIds.length > 0) && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {askRes.eventIds.length > 0
                    ? askRes.eventIds.map((id) => { const e = state?.events.find((x) => x.id === id); return e ? <button type="button" key={id} onClick={() => openEvent(id)} className="rounded-md border border-line px-2 py-1 text-xs hover:bg-surface">{e.title}</button> : null; })
                    : askRes.buildingIds.map((id) => <button type="button" key={id} onClick={() => openBuilding(id)} className="rounded-md border border-line px-2 py-1 text-xs hover:bg-surface">{BUILDING_BY_ID[id]?.name}</button>)}
                </div>
              )}
            </div>
          )}
        </form>

        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" onClick={() => setInboxOpen(true)}><Inbox size={16} /> Inbox</Button>
          <Link href="/dashboard" className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-surface">Organizers</Link>
          <div className="relative">
            <button onClick={() => setNotifOpen((o) => !o)} className="relative rounded-lg p-2 hover:bg-surface" aria-label="Notifications">
              <Bell size={18} />
              {unread > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-cardinal" />}
            </button>
            {notifOpen && (
              <div className="fade-in absolute right-0 top-11 z-40 w-96 overflow-hidden rounded-lg border border-line bg-white shadow-lg">
                <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                  <span className="text-sm font-semibold">Notifications</span>
                  <button onClick={markAllRead} className="text-xs text-muted hover:text-foreground">Mark all read</button>
                </div>
                <div className="scroll-thin max-h-[60vh] overflow-y-auto">
                  {notifs.map((n) => (
                    <button key={n.id} onClick={() => { if (n.eventId) openEvent(n.eventId); else if (n.buildingId) openBuilding(n.buildingId); setNotifOpen(false); }} className="flex w-full gap-3 border-b border-line px-4 py-3 text-left last:border-0 hover:bg-surface">
                      <span className={cx("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-cardinal")} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{n.title}</div>
                        <div className="text-xs text-muted">{n.body}</div>
                        <div className="mt-0.5 text-[11px] text-muted">{new Date(n.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}{n.source && n.source !== "live" ? ` · ${n.source}` : ""}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {state && <div className="ml-2" title={`${state.me.name}, ${state.me.major}`}><Avatar initials={state.me.avatar} size={30} /></div>}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <aside className="flex w-[372px] shrink-0 flex-col border-r border-line bg-white">
          {!detailOpen && (
            <nav className="flex gap-4 border-b border-line px-4">
              {([["now", "For you"], ["events", "Events"], ["study", "Study spots"]] as const).map(([t, l]) => (
                <button key={t} onClick={() => setTab(t)} className={cx("-mb-px border-b-2 py-3 text-sm font-medium", tab === t ? "border-cardinal text-foreground" : "border-transparent text-muted hover:text-foreground")}>{l}</button>
              ))}
            </nav>
          )}
          <div className={cx("min-h-0 flex-1 p-4", !detailOpen && tab === "events" ? "overflow-hidden" : "scroll-thin overflow-y-auto")}>
            {!state ? (
              <div className="space-y-2"><div className="skeleton h-24" /><div className="skeleton h-16" /><div className="skeleton h-16" /></div>
            ) : openAlert ? (
              <AlertDetail alert={openAlert} now={now} onClose={closeDetail} onResolved={() => { closeDetail(); refresh(); }} />
            ) : event ? (
              <EventDetail ev={event} state={state} loc={loc} onClose={closeDetail} onRsvp={rsvp} onInvite={invite} onOpenBuilding={openBuilding} />
            ) : selBuilding ? (
              <BuildingDetail id={selBuilding} loc={loc} now={now} tick={tick} onClose={closeDetail} onOpenEvent={openEvent} />
            ) : tab === "now" ? (
              <NowPanel state={state} loc={loc} onOpenEvent={openEvent} onOpenBuilding={openBuilding} onRsvp={rsvp} />
            ) : tab === "events" ? (
              <EventsPanel events={visible} filters={filters} setFilters={setFilters} loc={loc} onOpen={openEvent} now={now} />
            ) : (
              <StudyPanel loc={loc} tick={tick} onOpenBuilding={openBuilding} />
            )}
          </div>
          <div className="border-t border-line p-3">
            <Button className="w-full" onClick={() => setAddOpen(true)}><Plus size={16} /> Add event</Button>
          </div>
        </aside>

        {/* Map */}
        <main className="relative min-w-0 flex-1">
          {/* Flat map. In 3D mode it shows satellite as a placeholder until the 3D campus has loaded. */}
          {state && (view === "map" || !flatGone) && (
            <MapView
              events={chips.events ? mapEvents : []}
              hotspots={state.hotspots}
              buildings={state.buildings}
              me={loc}
              layers={layers}
              mapStyle={view === "3d" ? "satellite" : "map"}
              selectedEventId={selEvent}
              highlightIds={askRes && askRes.eventIds.length ? askRes.eventIds : null}
              focus={focus}
              onSelectEvent={openEvent}
              onSelectBuilding={openBuilding}
              callouts={walk ? [] : callouts}
              alerts={chips.safety ? state.alerts : []}
              onCallout={onCallout}
              initialCamera={startCam}
              onCamera={onFlatCamera}
              walk={view === "map" && walk && BUILDING_BY_ID[walk.toId] ? { to: BUILDING_BY_ID[walk.toId], key: walk.key } : null}
              onWalkEnd={() => { setWalk(null); setAsk(""); }}
            />
          )}
          {state && (view === "3d" || warmSat) && (
            <div className="absolute inset-0 z-[1] transition-opacity duration-700" style={{ opacity: threeReady ? 1 : 0, pointerEvents: threeReady ? "auto" : "none" }}>
              <Google3DView
                events={chips.events ? mapEvents : []}
                buildings={state.buildings}
                me={loc}
                selectedEventId={selEvent}
                highlightIds={askRes && askRes.eventIds.length ? askRes.eventIds : null}
                focus={focus}
                onSelectEvent={openEvent}
                initialCamera={startCam}
                follow={camBus}
                onReady={() => { setSatLoaded(true); if (view === "3d") setTimeout(() => setFlatGone(true), 800); }}
                onCamera={(c) => { camera.current = c; }}
                walk={walk && BUILDING_BY_ID[walk.toId] ? { to: BUILDING_BY_ID[walk.toId], key: walk.key } : null}
                onWalkEnd={() => { setWalk(null); setAsk(""); }}
                callouts={walk ? [] : callouts}
                alerts={chips.safety ? state.alerts : []}
                hotspots={state.hotspots}
                showHeat={layers.hotspots}
                onCallout={onCallout}
              />
            </div>
          )}
          {view === "3d" && !threeReady && (
            <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border border-line bg-white px-3 py-1 text-xs text-muted shadow-sm">Loading 3D campus…</div>
          )}

          <div className="absolute left-3 top-3 z-10 flex items-center gap-1 rounded-lg border border-line bg-white p-1 text-xs shadow-sm">
            <span className="px-1.5 text-muted">You are at</span>
            <select className="rounded-md bg-surface px-2 py-1 font-medium outline-none" value={loc.buildingId ?? ""} onChange={(e) => { const b = BUILDING_BY_ID[e.target.value]; setLoc({ lat: b.lat, lng: b.lng, label: b.name, buildingId: b.id }); setFocus({ lat: b.lat, lng: b.lng, zoom: 16.5, key: ++focusSeq.current }); }}>
              {!loc.buildingId && <option value="">{loc.label}</option>}
              {BUILDINGS.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <button onClick={useGps} className="rounded-md p-1 text-muted hover:bg-surface hover:text-foreground" title="Use my location"><LocateFixed size={14} /></button>
          </div>

          <div className="absolute right-3 top-3 z-10 flex rounded-lg border border-line bg-white p-1 text-xs shadow-sm">
            {([["map", "Explore"], ["3d", "Satellite"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => switchView(k)} onMouseEnter={() => { if (k === "3d" && view === "map") setWarmSat(true); }} className={cx("rounded-md px-3 py-1 font-medium", view === k ? "bg-foreground text-white" : "text-muted hover:bg-surface")}>{l}</button>
            ))}
          </div>

          {!(view === "3d" && !threeReady) && (
            <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5">
              {([["games", "Live games"], ["busy", "Busy spots"], ["safety", "Safety"], ["schedule", "My schedule"], ["events", "Events"], ["webcams", "Webcams"]] as const).map(([k, l]) => (
                <button key={k} onClick={() => setChips((c) => ({ ...c, [k]: !c[k] }))}
                  className={cx("whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold shadow-sm transition-colors", chips[k] ? "bg-cardinal text-white" : "border border-line bg-white text-foreground hover:bg-surface")}>{l}</button>
              ))}
              <span className="mx-1 h-5 w-px bg-black/10" />
              {(view === "map" ? ([["hotspots", "Heat"], ["places", "Places"]] as const) : ([["hotspots", "Heat"]] as const)).map(([k, l]) => (
                <button key={k} onClick={() => setLayers((x) => ({ ...x, [k]: !x[k] }))}
                  className={cx("whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium shadow-sm", layers[k] ? "bg-foreground text-white" : "border border-line bg-white text-muted hover:bg-surface")}>{l}</button>
              ))}
            </div>
          )}

          <div className="pointer-events-none absolute bottom-12 right-14 z-20 flex w-80 flex-col gap-2">
            {toasts.map((n) => (
              <button key={n.id} onClick={() => { if (n.eventId) openEvent(n.eventId); else if (n.buildingId) openBuilding(n.buildingId); setToasts((t) => t.filter((x) => x.id !== n.id)); }}
                className="fade-in pointer-events-auto rounded-lg border border-line bg-white p-3 text-left shadow-md">
                <div className="text-sm font-medium">{n.title}</div>
                <div className="text-xs text-muted">{n.body}</div>
              </button>
            ))}
          </div>
        </main>
      </div>

      {cam && <WebcamViewer key={cam.id} cam={cam} onClose={() => setCam(null)} />}
      {state && <AddEventModal open={addOpen} onClose={() => setAddOpen(false)} state={state} onCreated={(e) => { refresh(); setTimeout(() => openEvent(e.id), 300); }} />}
      <InboxModal open={inboxOpen} onClose={() => setInboxOpen(false)} onChanged={() => { refresh(); pollNotifs(); }} />
    </div>
  );
}
