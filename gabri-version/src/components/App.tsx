"use client";

import { Bell, Inbox, LayoutDashboard, LogOut, Menu, Navigation, Plus, Settings, UserRound, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BUILDING_BY_ID, BUILDINGS, distanceMeters, SCHOOLS } from "@/lib/campus";
import { api, applyFilters, DEFAULT_FILTERS, type AppState, type EventView, type Filters, type Loc, type Notification } from "@/lib/client-types";
import { buildCallouts, type Callout, type ChipState } from "@/lib/callouts";
import { parseNavQuery } from "@/lib/nav";
import { WEBCAMS, type Webcam } from "@/lib/webcams";
import AlertDetail from "./AlertDetail";
import AskBar, { type AskRes } from "./AskBar";
import WebcamViewer from "./WebcamViewer";
import AddEventModal from "./AddEventModal";
import { BuildingDetail, EventDetail } from "./Drawers";
import EventsPanel from "./EventsPanel";
import InboxModal from "./InboxModal";
import type { Camera, MapLayers } from "./MapView";
import MenuPanel from "./MenuPanel";
import WeatherPill from "./weather/WeatherPill";
import { useCampusWeather } from "./weather/useCampusWeather";
import SignIn, { clearSession, loadSession, signIn } from "./SignIn";
import type { CameraBus } from "./Google3DView";
import NowPanel from "./NowPanel";
import StudyPanel from "./StudyPanel";
import { AccountBadge, Avatar, Button, cx } from "./ui";

const Google3DView = dynamic(() => import("./Google3DView"), { ssr: false, loading: () => <div className="absolute inset-0 bg-surface" /> });
const MapView = dynamic(() => import("./MapView"), { ssr: false, loading: () => <div className="absolute inset-0 bg-surface" /> });

type Tab = "menu" | "events" | "study";
const START_LOC: Loc = { lat: BUILDING_BY_ID.gin.lat, lng: BUILDING_BY_ID.gin.lng, label: "Ginsburg Hall", buildingId: "gin" };

/** Keep the previous object for every part of the state that didn't change, so nothing downstream re-runs. */
function mergeState(prev: AppState | null, next: AppState): AppState {
  if (!prev) return next;
  const out = { ...next } as Record<string, unknown>;
  const old = prev as unknown as Record<string, unknown>;
  for (const k of Object.keys(out)) if (k !== "now" && JSON.stringify(old[k]) === JSON.stringify(out[k])) out[k] = old[k];
  return out as unknown as AppState;
}

export default function App() {
  const { weather } = useCampusWeather();
  const [state, setState] = useState<AppState | null>(null);
  const [tab, setTab] = useState<Tab>("menu");
  const [menuOpen, setMenuOpen] = useState(false); // the side panel: pushes the map on desktop, bottom sheet on phones
  const [signedIn, setSignedIn] = useState<boolean | null>(null); // null while the saved session is being checked
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountTab, setAccountTab] = useState<"account" | "inbox" | "notifications">("account");
  const accountArea = useRef<HTMLDivElement>(null);
  const accountButton = useRef<HTMLButtonElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const grip = useRef<number | null>(null); // where a drag on the phone sheet's handle started
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [loc, setLoc] = useState<Loc>(START_LOC);
  const [gps, setGps] = useState<"off" | "asking" | "on">("off"); // "on" once we have a real fix
  const [layers] = useState<MapLayers>({ events: true, hotspots: true, columns: false, places: false });
  const [view, setView] = useState<"map" | "3d">("map");
  const [chipState, setChips] = useState<ChipState>({ games: true, events: true, food: false, crowds: true, safety: true, schedule: true, webcams: true });
  const [selAlert, setSelAlert] = useState<string | null>(null);
  const [cam, setCam] = useState<Webcam | null>(null);
  const [satLoaded, setSatLoaded] = useState(false); // photoreal tiles loaded enough to show
  const [warmSat, setWarmSat] = useState(false); // Satellite pre-loads while you hover its button
  const coolSat = useRef<ReturnType<typeof setTimeout>>(undefined); // ...and unloads 5s after you move away
  const [intro, setIntro] = useState(true); // campus glide on first load (bubbles wait for it)
  useEffect(() => { const t = setTimeout(() => setIntro(false), 6000); return () => clearTimeout(t); }, []); // never hold bubbles back longer // start loading Satellite in the background (on hover)
  const threeReady = view === "3d" && satLoaded;
  const [flatGone, setFlatGone] = useState(false); // flat satellite placeholder removed after the fade
  const camera = useRef<Camera | null>(null); // shared so switching views keeps the same spot
  const [camBus] = useState<CameraBus>(() => ({ listeners: new Set() }));
  const [startCam, setStartCam] = useState<Camera | null>(null); // camera snapshot taken when switching views
  const [selEvent, setSelEvent] = useState<string | null>(null);
  const [selBuilding, setSelBuilding] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lng: number; zoom?: number; key: number } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [toasts, setToasts] = useState<Notification[]>([]);
  const [askKey, setAskKey] = useState(0); // bump to clear the search box
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
    clearTimeout(coolSat.current);
    if (v === "map") { setSatLoaded(false); setWarmSat(false); } // free the GPU when leaving Satellite
    else if (satLoaded) setTimeout(() => setFlatGone(true), 800); // pre-warmed: fade straight in
    setView(v);
  }
  const onFlatCamera = (c: Camera) => {
    camera.current = c;
    camBus.listeners.forEach((fn) => fn(c));
  };

  const refresh = useCallback(async () => {
    try { const next = await api<AppState>("/api/state"); setState((prev) => mergeState(prev, next)); setTick((t) => t + 1); } catch { /* keep last state */ }
  }, []);

  const lastNotif = useRef<string | null>(null); // newest notification we have; the server only sends newer ones
  const pollNotifs = useCallback(async () => {
    try {
      const since = lastNotif.current;
      const r = await api<{ notifications: Notification[]; unread: number }>(since ? `/api/notifications?since=${encodeURIComponent(since)}` : "/api/notifications");
      if (!r.notifications.length) return; // nothing new: no re-render
      lastNotif.current = r.notifications.reduce((m, n) => (n.createdAt > m ? n.createdAt : m), since ?? "");
      if (!seenNotifs.current) { seenNotifs.current = new Set(r.notifications.map((n) => n.id)); setNotifs(r.notifications); }
      else {
        setNotifs((prev) => [...r.notifications.filter((n) => !prev.some((p) => p.id === n.id)), ...prev].slice(0, 60));
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

  // restore a saved sign-in (the demo store forgets it when the server restarts, so it is re-applied)
  useEffect(() => {
    const saved = loadSession();
    // one data load at startup: after the saved sign-in is re-applied, or straight away for the sign-in screen
    const t = setTimeout(() => { if (!saved) { setSignedIn(false); refresh(); } else signIn(saved).then(() => { setSignedIn(true); refresh(); }, () => { setSignedIn(false); refresh(); }); }, 0);
    return () => clearTimeout(t);
  }, [refresh]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") {
      if (accountOpen) { setAccountOpen(false); accountButton.current?.focus(); }
      else if (menuOpen) { setMenuOpen(false); menuButton.current?.focus(); }
    } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [accountOpen, menuOpen]);

  useEffect(() => {
    if (!accountOpen) return;
    const dismiss = (e: PointerEvent) => { if (!accountArea.current?.contains(e.target as Node)) setAccountOpen(false); };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [accountOpen]);

  useEffect(() => {
    const first = setTimeout(pollNotifs, 0);
    // no polling while the tab is in the background; catch up the moment it's back
    const a = setInterval(() => { if (!document.hidden) refresh(); }, 20_000);
    const b = setInterval(() => { if (!document.hidden) pollNotifs(); }, 8_000);
    const back = () => { if (!document.hidden) { refresh(); pollNotifs(); } };
    document.addEventListener("visibilitychange", back);
    return () => { clearTimeout(first); clearInterval(a); clearInterval(b); document.removeEventListener("visibilitychange", back); };
  }, [refresh, pollNotifs]);
  // start downloading the map code right away instead of after the first data load
  useEffect(() => { void import("./MapView"); }, []);

  const now = useMemo(() => new Date(state?.now ?? 0), [state?.now]);
  const visible = useMemo(() => (state ? applyFilters(state.events, filters, now) : []), [state, filters, now]);
  // everything the maps receive is memoized: unrelated re-renders (typing, polls, toasts) never re-send map data
  const mapEvents = useMemo(() => (askRes ? state?.events.filter((e) => askRes.eventIds.includes(e.id) || visible.some((v) => v.id === e.id)) ?? [] : visible), [askRes, state, visible]);
  const shownEvents = useMemo(() => (chipState.events ? mapEvents : []), [chipState.events, mapEvents]);
  const highlight = useMemo(() => (askRes && askRes.eventIds.length ? askRes.eventIds : null), [askRes]);
  const shownAlerts = useMemo(() => (chipState.safety && state ? state.alerts : []), [chipState.safety, state]);
  const event = state?.events.find((e) => e.id === selEvent) ?? null;
  const openAlert = state?.alerts.find((a) => a.id === selAlert) ?? null;
  const chips = useMemo(() => ({ ...chipState, food: filters.freeFood }), [chipState, filters.freeFood]);
  const callouts = useMemo(() => (state ? buildCallouts(state, chips, now) : []), [state, chips, now]);
  const mapLayers = useMemo(() => ({ ...layers, hotspots: chips.crowds, places: false }), [layers, chips.crowds]);
  const noCallouts = useMemo(() => [], []);

  const openEvent = (id: string) => {
    const e = state?.events.find((x) => x.id === id);
    setSelBuilding(null); setSelEvent(id); setMenuOpen(true); // details show in the side panel
    if (e?.lat != null && e.lng != null) setFocus({ lat: e.lat, lng: e.lng, key: ++focusSeq.current });
  };
  const openBuilding = (id: string) => {
    const b = BUILDING_BY_ID[id];
    setSelEvent(null); setSelBuilding(id); setMenuOpen(true);
    if (b) setFocus({ lat: b.lat, lng: b.lng, key: ++focusSeq.current });
  };
  const closeDetail = () => { setSelEvent(null); setSelBuilding(null); setSelAlert(null); };

  // Only Student Creator accounts can post; students are pointed to Settings to switch.
  const router = useRouter();
  const isCreator = state?.me.accountType === "creator";
  const requestAddEvent = () => (isCreator ? setAddOpen(true) : router.push("/settings?section=account&reason=post"));

  // "/?event=<id>" (from the profile page) opens that event once the data is in
  const pendingEvent = useRef<string | null>(null);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("event");
    if (id) { pendingEvent.current = id; window.history.replaceState(null, "", "/"); }
  }, []);
  useEffect(() => {
    const id = pendingEvent.current;
    if (!state || !id || !state.events.some((e) => e.id === id)) return;
    pendingEvent.current = null;
    const t = setTimeout(() => openEvent(id), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  function onCallout(c: Callout) {
    const [kind, id] = c.id.split(":");
    if (kind === "ev") openEvent(id);
    else if (kind === "b") openBuilding(id);
    else if (kind === "al") { setSelEvent(null); setSelBuilding(null); setSelAlert(id); setMenuOpen(true); setFocus({ lat: c.lat, lng: c.lng, zoom: 17.2, key: ++focusSeq.current }); }
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
  /** Locate button: with a fix, just re-center; otherwise ask the browser once. Off campus or denied keeps the demo spot. */
  function locateMe() {
    const center = (l: { lat: number; lng: number }) => setFocus({ lat: l.lat, lng: l.lng, zoom: 17, key: ++focusSeq.current });
    if (gps === "on" || !navigator.geolocation) { center(loc); return; }
    setGps("asking");
    navigator.geolocation.getCurrentPosition((p) => {
      const here = { lat: p.coords.latitude, lng: p.coords.longitude };
      const nearest = [...BUILDINGS].sort((a, b) => distanceMeters(here, a) - distanceMeters(here, b))[0];
      if (distanceMeters(here, nearest) > 1500) { setGps("off"); center(loc); return; } // off campus: keep the demo location
      setLoc({ ...here, label: `near ${nearest.name}`, buildingId: nearest.id });
      setGps("on");
      center(here);
    }, () => { setGps("off"); center(loc); }, { enableHighAccuracy: true, timeout: 8000 });
  }
  const endWalk = useCallback(() => { setWalk(null); setAskKey((k) => k + 1); }, []);
  async function markAllRead() {
    await api("/api/notifications", { json: { all: true } });
    setNotifs((n) => n.map((x) => ({ ...x, read: true })));
  }

  const unread = notifs.filter((n) => !n.read).length;
  const detailOpen = !!(event || selBuilding || openAlert);

  return (
    <div className="map-app relative h-dvh w-full overflow-hidden bg-background" data-night={!weather.isDay}>
      <header className="map-header" aria-label="Map navigation">
        <button ref={menuButton} onClick={() => setMenuOpen((o) => !o)} className="map-menu-button" aria-label="Menu" aria-expanded={menuOpen} aria-controls="campus-menu"><Menu size={28} strokeWidth={2} /></button>
        <div ref={accountArea} className="account-area">
          <button ref={accountButton} onClick={() => { setAccountOpen((o) => !o); setAccountTab("account"); }} title={state?.me.name ?? "Account"} aria-label="Account" aria-expanded={accountOpen} aria-controls="account-panel" className="map-profile">
            {state?.me.avatar ?? <UserRound size={16} />}
            {unread > 0 && <span className="profile-unread" aria-label={`${unread} unread notifications`} />}
          </button>
          {accountOpen && state && (
            <section id="account-panel" className="account-panel" aria-label="Your account">
              <div className="flex items-center gap-2.5 px-3 pb-2 pt-3">
                <Avatar initials={state.me.avatar} photo={state.me.photo} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold">{state.me.name}</div>
                  <div className="truncate text-xs text-muted">{state.me.major || SCHOOLS.find((x) => x.id === state.me.school)?.name}</div>
                </div>
                <button aria-label="Close account" className="icon-action" onClick={() => { setAccountOpen(false); accountButton.current?.focus(); }}><X size={18} /></button>
              </div>
              <div className="account-tabs" role="tablist" aria-orientation="vertical" aria-label="Account sections" onKeyDown={(e) => {
                const tabs = ["account", "inbox", "notifications"] as const;
                let index = tabs.indexOf(accountTab);
                if (e.key === "ArrowDown") index = (index + 1) % tabs.length;
                else if (e.key === "ArrowUp") index = (index + tabs.length - 1) % tabs.length;
                else if (e.key === "Home") index = 0;
                else if (e.key === "End") index = tabs.length - 1;
                else return;
                e.preventDefault(); setAccountTab(tabs[index]);
                e.currentTarget.querySelectorAll<HTMLButtonElement>("button")[index]?.focus();
              }}>
                {([["account", "Profile", UserRound], ["inbox", "Inbox", Inbox], ["notifications", "Notifications", Bell]] as const).map(([key, label, Icon]) => (
                  <button key={key} role="tab" id={`account-tab-${key}`} aria-selected={accountTab === key} aria-controls={`account-content-${key}`} tabIndex={accountTab === key ? 0 : -1} onClick={() => setAccountTab(key)}>
                    <Icon size={15} /><span>{label}</span>{key === "notifications" && unread > 0 && <span className="unread-count">{unread}</span>}
                  </button>
                ))}
              </div>
              <div className="account-content scroll-thin" role="tabpanel" id={`account-content-${accountTab}`} aria-labelledby={`account-tab-${accountTab}`} tabIndex={0}>
                {accountTab === "account" && <div className="p-2 text-sm">
                  <div className="px-3 py-2"><AccountBadge type={state.me.accountType} /></div>
                  <Link href="/profile" onClick={() => setAccountOpen(false)} className="menu-item"><UserRound size={17} /> View profile</Link>
                  <Link href="/settings" onClick={() => setAccountOpen(false)} className="menu-item"><Settings size={17} /> Settings</Link>
                  <Link href="/dashboard" onClick={() => setAccountOpen(false)} className="menu-item"><LayoutDashboard size={17} /> Organizer dashboard</Link>
                  <div className="menu-sep" />
                  <button className="menu-item text-cardinal" onClick={() => { clearSession(); setAccountOpen(false); setMenuOpen(false); setSignedIn(false); }}><LogOut size={17} /> Sign out</button>
                </div>}
                {accountTab === "inbox" && <div className="p-4"><InboxModal open embedded onClose={() => setAccountOpen(false)} onChanged={() => { refresh(); pollNotifs(); }} /></div>}
                {accountTab === "notifications" && <div className="p-2">
                  {unread > 0 && <div className="flex justify-end px-2 pb-2"><button onClick={markAllRead} className="min-h-10 text-sm font-medium text-cardinal">Mark all read</button></div>}
                  {!notifs.length && <p className="px-3 py-8 text-center text-sm text-muted">You&apos;re all caught up.</p>}
                  {notifs.map((n) => (
                    <button key={n.id} onClick={() => { if (n.eventId) openEvent(n.eventId); else if (n.buildingId) openBuilding(n.buildingId); setAccountOpen(false); }} className="menu-item !items-start">
                      <span className={cx("mt-[7px] h-2 w-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-cardinal")} />
                      <span className="min-w-0 flex-1 text-left">
                        <span className={cx("block text-sm", n.read ? "font-medium" : "font-semibold")}>{n.title}</span>
                        <span className="mt-1 block text-[13px] leading-relaxed text-muted">{n.body}</span>
                        <span className="mt-1 block text-xs text-muted">{new Date(n.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                      </span>
                    </button>
                  ))}
                </div>}
              </div>
            </section>
          )}
        </div>
      </header>
      <WeatherPill weather={weather} />

      <div className="absolute inset-0">
        {/* Sidebar */}
        {/* Menu panel (see .side in globals.css): opened by the menu button, pushes the map on desktop, bottom sheet on phones */}
        <aside id="campus-menu" aria-label="Campus menu" className={cx("side", menuOpen && "side-open")} aria-hidden={!menuOpen} inert={!menuOpen}>
          <div className="side-inner">
          <button className="side-grip" aria-label="Collapse menu" onClick={() => setMenuOpen(false)}
            onPointerDown={(e) => { grip.current = e.clientY; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerUp={(e) => { if (grip.current != null && e.clientY - grip.current > 50) setMenuOpen(false); grip.current = null; }} />
          <div className="flex shrink-0 items-center justify-between px-5 pb-2 pt-4">
            <Link href="/" className="text-xl font-semibold tracking-tight">USC<span className="text-cardinal">Live</span></Link>
            <button onClick={() => { setMenuOpen(false); menuButton.current?.focus(); }} className="icon-action" aria-label="Close menu"><X size={20} /></button>
          </div>
          {!detailOpen && (
            <nav className="flex items-center gap-4 border-b border-line px-4">
              {([["menu", "Home"], ["events", "Events"], ["study", "Study spots"]] as const).map(([t, l]) => (
                <button key={t} onClick={() => setTab(t)} className={cx("-mb-px border-b-2 py-3 text-sm font-medium", tab === t ? "border-cardinal text-foreground" : "border-transparent text-muted hover:text-foreground")}>{l}</button>
              ))}
            </nav>
          )}
          <div className={cx("min-h-0 flex-1 p-4", !detailOpen && tab === "events" ? "overflow-hidden" : "scroll-thin overflow-y-auto")}>
            {!state ? (
              <div className="space-y-2"><div className="skeleton h-24" /><div className="skeleton h-16" /><div className="skeleton h-16" /></div>
            ) : openAlert ? (
              <AlertDetail alert={openAlert} now={now} onClose={closeDetail} />
            ) : event ? (
              <EventDetail ev={event} state={state} loc={loc} onClose={closeDetail} onRsvp={rsvp} onInvite={invite} onOpenBuilding={openBuilding} onDirections={(bid) => { if (bid !== loc.buildingId) setWalk({ toId: bid, key: ++focusSeq.current }); }} />
            ) : selBuilding ? (
              <BuildingDetail id={selBuilding} loc={loc} now={now} tick={tick} onClose={closeDetail} onOpenEvent={openEvent} />
            ) : tab === "menu" ? (
              <>
                <NowPanel compact active={menuOpen} state={state} loc={loc} onOpenEvent={openEvent} onOpenBuilding={openBuilding} onRsvp={rsvp} />
                <div className="mt-4"><MenuPanel active={menuOpen} state={state} loc={loc} onOpenEvent={openEvent} onOpenBuilding={openBuilding} onAddEvent={requestAddEvent} onStudy={() => setTab("study")} /></div>
              </>
            ) : tab === "events" ? (
              <EventsPanel events={visible} filters={filters} setFilters={setFilters} loc={loc} onOpen={openEvent} now={now} />
            ) : (
              <StudyPanel loc={loc} tick={tick} onOpenBuilding={openBuilding} />
            )}
          </div>
          <div className="border-t border-line p-3">
            {isCreator ? (
              <Button className="w-full !rounded-full" onClick={requestAddEvent}><Plus size={16} /> Add event</Button>
            ) : (
              <Button variant="secondary" className="w-full !rounded-full" onClick={requestAddEvent} title="Only Student Creator accounts can post events">✦ Become a creator to post events</Button>
            )}
          </div>
          </div>
        </aside>

        {/* Map */}
        <main className={cx("absolute inset-0", menuOpen && "side-on")}>
          {/* Flat map. In 3D mode it shows satellite as a placeholder until the 3D campus has loaded. */}
          {state && (view === "map" || !flatGone) && (
            <MapView
              weather={weather}
              events={shownEvents}
              hotspots={state.hotspots}
              buildings={BUILDINGS}
              me={loc}
              layers={mapLayers}
              leftInset={menuOpen && typeof window !== "undefined" && window.innerWidth > 900 ? 384 : 0}
              mapStyle="map"
              selectedEventId={selEvent}
              highlightIds={highlight}
              focus={focus}
              onSelectEvent={openEvent}
              onSelectBuilding={openBuilding}
              callouts={walk || intro ? noCallouts : callouts}
              alerts={shownAlerts}
              onCallout={onCallout}
              initialCamera={startCam}
              onCamera={onFlatCamera}
              intro={intro}
              onIntroDone={() => setIntro(false)}
              walk={view === "map" && walk && BUILDING_BY_ID[walk.toId] ? { to: BUILDING_BY_ID[walk.toId], key: walk.key } : null}
              onWalkEnd={endWalk}
            />
          )}
          {state && (view === "3d" || warmSat) && (
            <div className="absolute inset-0 z-[1] transition-opacity duration-700" style={{ opacity: threeReady ? 1 : 0, pointerEvents: threeReady ? "auto" : "none" }}>
              <Google3DView
                weather={weather}
                active={view === "3d"}
                events={shownEvents}
                buildings={BUILDINGS}
                me={loc}
                selectedEventId={selEvent}
                highlightIds={highlight}
                focus={focus}
                onSelectEvent={openEvent}
                initialCamera={startCam}
                follow={camBus}
                onReady={() => { setSatLoaded(true); if (view === "3d") setTimeout(() => setFlatGone(true), 800); }}
                onCamera={(c) => { camera.current = c; }}
                walk={walk && BUILDING_BY_ID[walk.toId] ? { to: BUILDING_BY_ID[walk.toId], key: walk.key } : null}
                onWalkEnd={endWalk}
                callouts={walk ? noCallouts : callouts}
                alerts={shownAlerts}
                hotspots={state.hotspots}
                showHeat={chips.crowds}
                onCallout={onCallout}
              />
            </div>
          )}
          {view === "3d" && !threeReady && (
            <div className="glass absolute left-1/2 top-24 z-10 -translate-x-1/2 rounded-full px-3 py-1 text-xs text-muted">Loading 3D campus…</div>
          )}


          <div className="map-dock">
            <div className="dock-inner">
              <div className="dock-options">
          <div className="map-view-controls">
            <div className="glass flex rounded-full p-1 text-xs">
              {([["map", "Explore"], ["3d", "Satellite"]] as const).map(([k, l]) => (
                <button key={k} onClick={() => switchView(k)} onMouseEnter={() => { if (k === "3d" && view === "map") { clearTimeout(coolSat.current); setWarmSat(true); } }}
                  onMouseLeave={() => { if (k === "3d" && view === "map") { clearTimeout(coolSat.current); coolSat.current = setTimeout(() => { setWarmSat(false); setSatLoaded(false); }, 5000); } }} className={cx("rounded-full px-3.5 py-1.5 font-medium", view === k ? "bg-white text-foreground shadow-[0_1px_4px_rgba(0,0,0,0.12)]" : "text-muted hover:text-foreground")}>{l}</button>
              ))}
            </div>
            {/* Maps-style locate button: centers on you, asks for location the first time */}
            <button onClick={locateMe} aria-label="Show my location" title={gps === "on" ? "Center on my location" : "Use my location"}
              className={cx("glass grid h-11 w-11 place-items-center rounded-full", gps === "on" ? "text-[#0a84ff]" : "text-foreground")}>
              {gps === "asking" ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Navigation size={15} className={cx(gps === "on" && "fill-current")} />}
            </button>
          </div>

              <div className="chip-row" role="group" aria-label="Map layers">
                {([["games", "Live games"], ["events", "Events"], ["food", "Free food"], ["crowds", "Crowds"], ["safety", "Safety"], ["schedule", "My schedule"], ["webcams", "Cams"]] as const).map(([k, l]) => (
                  <button key={k} aria-pressed={chips[k]}
                    onClick={() => (k === "food" ? setFilters((f) => ({ ...f, freeFood: !f.freeFood })) : setChips((c) => ({ ...c, [k]: !c[k] })))}
                    className="map-layer-chip">{l}</button>
                ))}
              </div>
              </div>
              <div className="dock-search-row">

              <AskBar key={askKey} res={askRes} busy={askBusy} events={state?.events ?? []} onAsk={runAsk} onClear={() => setAskRes(null)} onOpenEvent={openEvent} onOpenBuilding={openBuilding} />

              </div>
            </div>
          </div>

          <div className="pointer-events-none absolute bottom-44 right-14 z-20 flex w-80 max-w-[calc(100vw-32px)] flex-col gap-2">
            {toasts.map((n) => (
              <button key={n.id} onClick={() => { if (n.eventId) openEvent(n.eventId); else if (n.buildingId) openBuilding(n.buildingId); setToasts((t) => t.filter((x) => x.id !== n.id)); }}
                className="glass glass-strong fade-in pointer-events-auto rounded-2xl p-3 text-left">
                <div className="text-sm font-medium">{n.title}</div>
                <div className="text-xs text-muted">{n.body}</div>
              </button>
            ))}
          </div>
        </main>
      </div>

      {cam && <WebcamViewer key={cam.id} cam={cam} onClose={() => setCam(null)} />}
      {state && <AddEventModal open={addOpen} onClose={() => setAddOpen(false)} state={state} onCreated={(e) => { refresh(); setTimeout(() => openEvent(e.id), 300); }} />}
      {signedIn === false && <SignIn onDone={() => { setSignedIn(true); refresh(); }} />}
    </div>
  );
}
