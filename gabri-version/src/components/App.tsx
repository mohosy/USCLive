"use client";

import { Bell, BookOpen, CalendarDays, ChevronDown, House, LayoutDashboard, LogOut, Moon, Navigation, Plus, Settings, Sun, Sunrise, Sunset, UserPlus, UserRound } from "lucide-react";
import { lightFor, type LightPreset } from "@/lib/sun";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BUILDING_BY_ID, BUILDINGS, distanceMeters, SCHOOLS } from "@/lib/campus";
import { api, applyFilters, DEFAULT_FILTERS, type AppState, type EventView, type Filters, type Loc, type Notification } from "@/lib/client-types";
import { buildCallouts, type Callout, type ChipState } from "@/lib/callouts";
import { WEBCAMS, type Webcam } from "@/lib/webcams";
import AlertDetail from "./AlertDetail";
import type { AskRes } from "./AskBar";
import ChatDock from "./ChatDock";
import type { ChatAction } from "@/lib/agent";
import CalendarSync, { syncCalendar } from "./CalendarSync";
import WebcamViewer from "./WebcamViewer";
import AddEventModal from "./AddEventModal";
import { BuildingDetail, EventDetail } from "./Drawers";
import EventsPanel from "./EventsPanel";
import InboxModal from "./InboxModal";
import type { Camera, MapLayers } from "./MapView";
import MenuPanel from "./MenuPanel";
import SignIn, { clearSession, loadSession, saveGoogleSession, signIn, type GooglePrefill } from "./SignIn";
import FindFriends from "./FindFriends";
import type { CameraBus } from "./Google3DView";
import NowPanel from "./NowPanel";
import StudyPanel from "./StudyPanel";
import { ExploreThumb, SatelliteThumb } from "./ViewThumb";
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
  const [state, setState] = useState<AppState | null>(null);
  const [tab, setTab] = useState<Tab>("menu");
  const [menuOpen, setMenuOpen] = useState(false); // the side panel: pushes the map on desktop, bottom sheet on phones
  const [signedIn, setSignedIn] = useState<boolean | null>(null); // null while the saved session is being checked
  const [accountOpen, setAccountOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false); // Find friends sheet
  const grip = useRef<number | null>(null); // where a drag on the phone sheet's handle started
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [loc, setLoc] = useState<Loc>(START_LOC);
  const [gps, setGps] = useState<"off" | "asking" | "on">("off"); // "on" once we have a real fix
  const [layers, setLayers] = useState<MapLayers>({ events: true, hotspots: true, columns: false, places: false });
  const [view, setView] = useState<"map" | "3d">("map");
  const [chipState, setChips] = useState<ChipState>({ games: true, events: true, food: true, crowds: true, safety: true, schedule: true, webcams: true });
  const [selAlert, setSelAlert] = useState<string | null>(null);
  const [cam, setCam] = useState<Webcam | null>(null);
  const [satLoaded, setSatLoaded] = useState(false); // photoreal tiles loaded enough to show
  const [warmSat, setWarmSat] = useState(false); // Satellite pre-loads while you hover its button
  // map lighting follows the real sun over campus; rechecked every minute
  // (read in the browser, not during the prerender; the map mounts after the first data load, so it starts in the right light)
  const [sunLight, setSunLight] = useState<LightPreset>("day");
  useEffect(() => {
    const tick = () => setSunLight(lightFor(new Date()));
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 60_000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, []);
  // TEMP (testing): force a time of day. Remove this and the switch under the view toggle before the demo.
  const [lightTest, setLightTest] = useState<LightPreset | "auto">("auto");
  const light = lightTest === "auto" ? sunLight : lightTest;
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
  const [inboxOpen, setInboxOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [toasts, setToasts] = useState<Notification[]>([]);
  const [google, setGoogle] = useState<{ configured: boolean; connected: boolean; lastSync: string | null } | null>(null);
  const [googlePrefill, setGooglePrefill] = useState<GooglePrefill | null>(null);
  const [askRes, setAskRes] = useState<AskRes | null>(null);
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

  const loadGoogle = useCallback(async () => {
    try {
      const st = await api<{ configured: boolean; connected: boolean; lastSync: string | null; profile: GooglePrefill | null; registered: boolean }>("/api/auth/google/status");
      setGoogle(st);
      return st;
    } catch { return null; }
  }, []);
  /** Pull Google Calendar into the map (replaces what came from it before, so edits show up). */
  const syncGoogle = useCallback(async (first = false) => {
    try {
      const r = await api<{ lastSync: string }>(`/api/calendar/google${first ? "?first=1" : ""}`, { method: "POST" });
      setGoogle((g) => (g ? { ...g, lastSync: r.lastSync } : g));
    } catch { /* not connected or Google is unreachable: try again next round */ }
  }, []);

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
    // back from Google's sign-in: new here -> finish the account (name prefilled); already signed in -> just sync
    const gq = new URLSearchParams(window.location.search).get("google");
    if (gq) {
      const reason = new URLSearchParams(window.location.search).get("reason");
      window.history.replaceState(null, "", "/");
      if (gq === "connected") {
        // the server already signed this browser into the Google account's own account
        const t0 = setTimeout(() => void loadGoogle().then((st) => {
          if (!st?.profile) { setSignedIn(false); refresh(); return; }
          if (st.registered) { saveGoogleSession(st.profile.email); setSignedIn(true); refresh(); }
          else { clearSession(); setGooglePrefill(st.profile); setSignedIn(false); refresh(); }
        }), 0);
        return () => clearTimeout(t0);
      }
      if (gq === "error") setTimeout(() => alert(`Google sign-in didn't work: ${reason ?? "unknown error"}`), 0);
    } else setTimeout(() => void loadGoogle(), 0);
    // one data load at startup: after the saved sign-in is re-applied, or straight away for the sign-in screen
    const t = setTimeout(() => { if (!saved) { setSignedIn(false); refresh(); } else signIn(saved).then(async () => {
      setSignedIn(true);
      if (saved.calendarUrl) await syncCalendar(saved.calendarUrl).catch(() => null); // the demo store forgets imports on restart (duplicates are skipped)
      refresh();
    }, () => { setSignedIn(false); refresh(); }); }, 0);
    return () => clearTimeout(t);
  }, [refresh, loadGoogle]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setMenuOpen(false); setAccountOpen(false); setNotifOpen(false); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const first = setTimeout(pollNotifs, 0);
    // no polling while the tab is in the background; catch up the moment it's back
    const a = setInterval(() => { if (!document.hidden) refresh(); }, 20_000);
    const b = setInterval(() => { if (!document.hidden) pollNotifs(); }, 8_000);
    const back = () => { if (!document.hidden) { refresh(); pollNotifs(); } };
    document.addEventListener("visibilitychange", back);
    return () => { clearTimeout(first); clearInterval(a); clearInterval(b); document.removeEventListener("visibilitychange", back); };
  }, [refresh, pollNotifs]);
  // Google Calendar stays live: sync when signed in, then every 3 minutes while the tab is visible
  const googleOn = !!(signedIn && google?.connected);
  useEffect(() => {
    if (!googleOn) return;
    const run = (first = false) => { if (!document.hidden) void syncGoogle(first).then(() => { refresh(); if (first) pollNotifs(); }); };
    const t0 = setTimeout(() => run(true), 0);
    const t = setInterval(() => run(), 3 * 60_000);
    return () => { clearTimeout(t0); clearInterval(t); };
  }, [googleOn, syncGoogle, refresh, pollNotifs]);
  // start downloading the map code right away instead of after the first data load
  useEffect(() => { void import("./MapView"); }, []);

  const now = useMemo(() => new Date(state?.now ?? 0), [state?.now]);
  const visible = useMemo(() => (state ? applyFilters(state.events, filters, now) : []), [state, filters, now]);
  // everything the maps receive is memoized: unrelated re-renders (typing, polls, toasts) never re-send map data
  const mapEvents = useMemo(() => (askRes ? state?.events.filter((e) => askRes.eventIds.includes(e.id) || visible.some((v) => v.id === e.id)) ?? [] : visible), [askRes, state, visible]);
  // chips are layers that add up: Events shows every event; Free food (on its own) shows just the food ones
  const shownEvents = useMemo(() => (chipState.events ? mapEvents : chipState.food ? mapEvents.filter((e) => e.freeFood) : []), [chipState.events, chipState.food, mapEvents]);
  const highlight = useMemo(() => (askRes && askRes.eventIds.length ? askRes.eventIds : null), [askRes]);
  const shownAlerts = useMemo(() => (chipState.safety && state ? state.alerts : []), [chipState.safety, state]);
  const event = state?.events.find((e) => e.id === selEvent) ?? null;
  const openAlert = state?.alerts.find((a) => a.id === selAlert) ?? null;
  const chips = chipState;
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
  /** The assistant asked the map to do something: open an event, walk somewhere, look at a place. */
  function chatAction(a: ChatAction) {
    if (a.type === "open_event") openEvent(a.eventId);
    else if (a.type === "walk") { if (a.buildingId !== loc.buildingId) { setSelEvent(null); setSelBuilding(null); setWalk({ toId: a.buildingId, key: ++focusSeq.current }); } }
    else { const b = BUILDING_BY_ID[a.buildingId]; if (b) setFocus({ lat: b.lat, lng: b.lng, zoom: 17, key: ++focusSeq.current }); }
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
  const endWalk = useCallback(() => setWalk(null), []);
  async function markAllRead() {
    await api("/api/notifications", { json: { all: true } });
    setNotifs((n) => n.map((x) => ({ ...x, read: true })));
  }

  const unread = notifs.filter((n) => !n.read).length;
  const detailOpen = !!(event || selBuilding || openAlert);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background">
      {/* Header */}
      {/* Floating glass header over the full-screen map */}
      {/* No header: the logo sits top-left; the bell and your profile float top-right */}
      <Link href="/" className="glass absolute left-3 top-3 z-30 flex h-10 items-center rounded-full px-4 text-[16px] font-semibold tracking-tight">
        USC<span className="text-cardinal">Live</span>
      </Link>
      <div className="absolute right-3 top-3 z-30 flex items-center gap-2">
          <div className="relative">
            <button onClick={() => { setAccountOpen(false); setNotifOpen((o) => !o); }} className="glass relative grid h-10 w-10 place-items-center rounded-full" aria-label="Notifications" aria-expanded={notifOpen}>
              <Bell size={18} />
              {unread > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-cardinal" />}
            </button>
            {notifOpen && (
              <div className="menu absolute right-0 top-12 z-40 w-[380px] max-w-[calc(100vw-24px)] overflow-hidden">
                <div className="flex items-center justify-between px-4 pb-1 pt-3">
                  <span className="text-[15px] font-semibold">Notifications</span>
                  {unread > 0 && <button onClick={markAllRead} className="text-[13px] font-medium text-[#0a84ff] hover:opacity-80">Mark all read</button>}
                </div>
                <div className="scroll-thin max-h-[60vh] overflow-y-auto p-1.5">
                  {!notifs.length && <p className="px-3 py-6 text-center text-sm text-muted">You&apos;re all caught up.</p>}
                  {notifs.map((n) => (
                    <button key={n.id} onClick={() => { if (n.eventId) openEvent(n.eventId); else if (n.buildingId) openBuilding(n.buildingId); setNotifOpen(false); }} className="menu-item !items-start">
                      <span className={cx("mt-[7px] h-2 w-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-[#0a84ff]")} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className={cx("truncate text-[14px]", n.read ? "font-medium" : "font-semibold")}>{n.title}</span>
                          <span className="shrink-0 text-[12px] text-muted">{new Date(n.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                        </div>
                        <div className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted">{n.body}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {state && (
            <div className="relative">
              <button onClick={() => { setNotifOpen(false); setAccountOpen((o) => !o); }} title={state.me.name} aria-label="Account" aria-expanded={accountOpen} className="rounded-full bg-white shadow-[0_4px_14px_rgba(0,0,0,0.14)] transition-transform hover:scale-105"><Avatar initials={state.me.avatar} photo={state.me.photo} size={40} /></button>
              {accountOpen && (
                <div className="menu absolute right-0 top-11 z-40 w-72 p-1.5 text-sm">
                  <div className="flex items-center gap-3 px-2.5 py-2">
                    <Avatar initials={state.me.avatar} photo={state.me.photo} size={44} />
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-semibold">{state.me.name}{state.me.pronouns && <span className="ml-1.5 text-xs font-normal text-muted">({state.me.pronouns})</span>}</div>
                      <div className="truncate text-[12px] text-muted">{state.me.username ? `@${state.me.username}` : state.me.major || SCHOOLS.find((x) => x.id === state.me.school)?.name}</div>
                      <AccountBadge type={state.me.accountType} className="mt-1" />
                    </div>
                  </div>
                  <div className="menu-sep" />
                  <Link href="/profile" onClick={() => setAccountOpen(false)} className="menu-item text-[14px]"><UserRound size={16} className="text-muted" /> View profile</Link>
                  <button onClick={() => { setAccountOpen(false); setFindOpen(true); }} className="menu-item text-[14px]"><UserPlus size={16} className="text-muted" /> Find friends</button>
                  <Link href="/settings" onClick={() => setAccountOpen(false)} className="menu-item text-[14px]"><Settings size={16} className="text-muted" /> Settings</Link>
                  <Link href="/dashboard" onClick={() => setAccountOpen(false)} className="menu-item text-[14px]"><LayoutDashboard size={16} className="text-muted" /> Organizer dashboard</Link>
                  <div className="menu-sep" />
                  <button className="menu-item text-[14px] text-[#d70015]" onClick={() => { clearSession(); void api("/api/session", { json: { action: "signout" } }).then(refresh); setAccountOpen(false); setMenuOpen(false); setSignedIn(false); }}><LogOut size={16} /> Sign out</button>
                </div>
              )}
            </div>
          )}
        </div>
      {findOpen && <FindFriends me={state?.me.username} onClose={() => setFindOpen(false)} onChanged={refresh} />}

      <div className="absolute inset-0">
        {/* Sidebar */}
        {/* Menu panel (see .side in globals.css): opened by the menu button, pushes the map on desktop, bottom sheet on phones */}
        <aside className={cx("side", menuOpen && "side-open")}>
          <div className="side-inner">
          <button className="side-grip" aria-label={menuOpen ? "Fold up the panel" : "Open the panel"} onClick={() => setMenuOpen((o) => !o)}
            onPointerDown={(e) => { grip.current = e.clientY; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerUp={(e) => { if (grip.current != null && e.clientY - grip.current > 50) setMenuOpen(false); grip.current = null; }} />
          {/* Always-visible bar: tap a tab to open the panel on it, tap the open tab (or the chevron) to fold it up */}
          <nav className="side-bar flex items-center gap-1 px-2">
            {([["menu", "Home", House], ["events", "Events", CalendarDays], ["study", "Study spots", BookOpen]] as const).map(([t, l, Icon]) => {
              const on = tab === t && menuOpen && !detailOpen;
              return (
                <button key={t} aria-pressed={on} onClick={() => { closeDetail(); if (on) setMenuOpen(false); else { setTab(t); setMenuOpen(true); } }}
                  className={cx("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium", on ? "bg-foreground text-white" : "text-foreground hover:bg-black/5")}>
                  <Icon size={15} /> {l}
                </button>
              );
            })}
            <button onClick={() => setMenuOpen((o) => !o)} className="ml-auto rounded-full p-1.5 text-muted hover:bg-black/5 hover:text-foreground" aria-label={menuOpen ? "Fold up the panel" : "Open the panel"} aria-expanded={menuOpen}>
              <ChevronDown size={18} className={cx("transition-transform duration-300", menuOpen && "rotate-180")} />
            </button>
          </nav>
          <div className={cx("min-h-0 flex-1 p-4", !detailOpen && tab === "events" ? "overflow-hidden" : "scroll-thin overflow-y-auto")}>
            {!state ? (
              <div className="space-y-2"><div className="skeleton h-24" /><div className="skeleton h-16" /><div className="skeleton h-16" /></div>
            ) : openAlert ? (
              <AlertDetail alert={openAlert} now={now} onClose={closeDetail} />
            ) : event ? (
              <EventDetail ev={event} state={state} loc={loc} onClose={closeDetail} onRsvp={rsvp} onInvite={invite} onFindFriends={() => setFindOpen(true)} onOpenBuilding={openBuilding} onDirections={(bid) => { if (bid !== loc.buildingId) setWalk({ toId: bid, key: ++focusSeq.current }); }} />
            ) : selBuilding ? (
              <BuildingDetail id={selBuilding} loc={loc} now={now} tick={tick} onClose={closeDetail} onOpenEvent={openEvent} />
            ) : tab === "menu" ? (
              <>
                <NowPanel compact active={menuOpen} onWalk={(bId) => chatAction({ type: "walk", buildingId: bId })} state={state} loc={loc} onOpenEvent={openEvent} onOpenBuilding={openBuilding} onRsvp={rsvp} />
                <div className="mt-4"><MenuPanel active={menuOpen} deadlines={notifs.filter((n) => n.kind === "deadline")} state={state} loc={loc} onOpenEvent={openEvent} onOpenBuilding={openBuilding} onAddEvent={requestAddEvent} onStudy={() => setTab("study")} /></div>
                <div className="mt-4"><CalendarSync demo={!!state.me.verified} google={google} onSyncGoogle={async () => { await syncGoogle(true); refresh(); pollNotifs(); }}
                  onDisconnectGoogle={async () => { await api("/api/auth/google/disconnect", { method: "POST" }); setGoogle((g) => (g ? { ...g, connected: false, lastSync: null } : g)); refresh(); }}
                  onSynced={() => { refresh(); pollNotifs(); }} onOpenInbox={() => setInboxOpen(true)} /></div>
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
              events={shownEvents}
              hotspots={state.hotspots}
              buildings={BUILDINGS}
              me={loc}
              layers={mapLayers}
              leftInset={menuOpen && typeof window !== "undefined" && window.innerWidth > 900 ? 384 : 0}
              mapStyle="map"
              light={light}
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
            <div className="glass absolute bottom-[88px] left-1/2 z-10 -translate-x-1/2 rounded-full px-3 py-1 text-xs text-muted">Loading 3D campus…</div>
          )}

          {/* Apple-style segmented control */}
          <div className="absolute right-3 top-[60px] z-10 flex items-center gap-2">
            <div className="glass flex rounded-full p-1 text-xs">
              {([["map", "Explore", ExploreThumb], ["3d", "Satellite", SatelliteThumb]] as const).map(([k, l, Thumb]) => (
                <button key={k} onClick={() => switchView(k)} onMouseEnter={() => { if (k === "3d" && view === "map") { clearTimeout(coolSat.current); setWarmSat(true); } }}
                  onMouseLeave={() => { if (k === "3d" && view === "map") { clearTimeout(coolSat.current); coolSat.current = setTimeout(() => { setWarmSat(false); setSatLoaded(false); }, 5000); } }} className={cx("group flex items-center gap-1.5 rounded-full py-[3px] pl-[3px] pr-3 font-medium", view === k ? "bg-white text-foreground shadow-[0_1px_4px_rgba(0,0,0,0.12)]" : "text-muted hover:text-foreground")}>
                  {/* Maps-style preview of what this view looks like */}
                  <span className={cx("h-[22px] w-[22px] overflow-hidden rounded-full shadow-[0_0_0_0.5px_rgba(0,0,0,0.18)] transition-opacity", view === k ? "opacity-100" : "opacity-75 group-hover:opacity-100")}><Thumb /></span>
                  {l}
                </button>
              ))}
            </div>
            {/* Maps-style locate button: centers on you, asks for location the first time */}
            <button onClick={locateMe} aria-label="Show my location" title={gps === "on" ? "Center on my location" : "Use my location"}
              className={cx("glass grid h-9 w-9 place-items-center rounded-full", gps === "on" ? "text-[#0a84ff]" : "text-foreground")}>
              {gps === "asking" ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Navigation size={15} className={cx(gps === "on" && "fill-current")} />}
            </button>
          </div>

          {/* TEMP (testing): time-of-day switch. "Auto" = real time at USC. */}
          {view === "map" && (
            <div className="glass absolute right-3 top-[124px] z-10 hidden items-center gap-0.5 rounded-full p-1 text-xs md:flex" title="Lighting test: Auto follows the real time">
              {([["auto", null, `Auto · ${sunLight}`], ["dawn", Sunrise, "Dawn"], ["day", Sun, "Day"], ["dusk", Sunset, "Dusk"], ["night", Moon, "Night"]] as const).map(([k, Icon, label]) => (
                <button key={k} onClick={() => setLightTest(k)} aria-label={label} aria-pressed={lightTest === k} title={label}
                  className={cx("grid h-7 place-items-center rounded-full font-medium", Icon ? "w-7" : "px-2.5", lightTest === k ? "bg-white text-foreground shadow-[0_1px_4px_rgba(0,0,0,0.12)]" : "text-muted hover:text-foreground")}>
                  {Icon ? <Icon size={14} /> : "Auto"}
                </button>
              ))}
            </div>
          )}

          {/* One filter row: each chip is a layer on the map (and its legend) */}
          <div className="chip-row absolute left-3 right-3 top-[112px] z-10 flex gap-1.5 overflow-x-auto pb-1">
            {([["games", "Live games"], ["events", "Events"], ["food", "Free food"], ["crowds", "Crowds"], ["safety", "Safety"], ["schedule", "My schedule"], ["webcams", "Cams"]] as const).map(([k, l]) => (
              <button key={k} aria-pressed={chips[k]}
                onClick={() => setChips((c) => ({ ...c, [k]: !c[k] }))}
                className={cx("whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors", chips[k] ? "bg-foreground text-white shadow-[0_2px_8px_rgba(0,0,0,0.18)]" : "bg-white/85 text-foreground shadow-[0_0_0_0.5px_rgba(0,0,0,0.1),0_2px_8px_rgba(0,0,0,0.06)] hover:bg-white")}>{l}</button>
            ))}
          </div>

          {state && (
            <ChatDock events={state.events} loc={loc} now={now} onAction={chatAction}
              onAnswer={(ids) => setAskRes(ids ? { answer: "", eventIds: ids, buildingIds: [], focusBuildingId: "none", ai: true } : null)}
              onChanged={() => { refresh(); pollNotifs(); }} />
          )}
          <div className="pointer-events-none absolute right-3 top-[112px] z-20 flex w-80 flex-col gap-2">
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
      <InboxModal open={inboxOpen} onClose={() => setInboxOpen(false)} onChanged={() => { refresh(); pollNotifs(); }} />
      {signedIn === false && <SignIn key={googlePrefill?.email ?? "plain"} google={googlePrefill} onDone={() => { setSignedIn(true); setGooglePrefill(null); refresh(); }} />}
    </div>
  );
}
