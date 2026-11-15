"use client";

import { Bell, BookOpen, CalendarDays, ChevronDown, House, Inbox, LayoutDashboard, LogOut, Map as MapIcon, Menu, Navigation, Plus, Satellite, Settings, SlidersHorizontal, UserPlus, UserRound, X } from "lucide-react";
import { lightFor, type LightPreset } from "@/lib/sun";
import { loadMapLighting, loadShowPeople, type MapLighting } from "@/lib/mapLighting";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BUILDING_BY_ID, BUILDINGS, distanceMeters, SCHOOLS } from "@/lib/campus";
import { api, applyFilters, DEFAULT_FILTERS, type AppState, type Building, type EventView, type Filters, type Hotspot, type Loc, type Notification } from "@/lib/client-types";
import { buildCallouts, type Callout, type ChipState } from "@/lib/callouts";
import { WEBCAMS, type Webcam } from "@/lib/webcams";
import AlertDetail from "./AlertDetail";
import type { AskRes } from "./AskBar";
import ChatDock from "./ChatDock";
import type { ChatAction } from "@/lib/agent";
import CalendarSync, { syncCalendar } from "./CalendarSync";
import WebcamViewer from "./WebcamViewer";
import AddEventModal from "./AddEventModal";
import { BuildingDetail, EventDetail, OrgDetail, type HostRef } from "./Drawers";
import EventsPanel from "./EventsPanel";
import InboxModal from "./InboxModal";
import type { Camera, MapLayers } from "./MapView";
import MenuPanel from "./MenuPanel";
import WeatherPill from "./weather/WeatherPill";
import { useCampusWeather } from "./weather/useCampusWeather";
import SignIn, { clearSession, loadSession, saveGoogleSession, signIn, type GooglePrefill } from "./SignIn";
import FindFriends from "./FindFriends";
import type { CameraBus } from "./Google3DView";
import NowPanel from "./NowPanel";
import StudyPanel from "./StudyPanel";
import { AccountBadge, Avatar, Button, cx } from "./ui";

/** Phones can't hold Mapbox and the photoreal 3D tiles in memory at once, so they unload Satellite when you leave it. */
const SAT_PHONE = typeof window !== "undefined" && window.matchMedia("(max-width: 900px), (pointer: coarse)").matches;
const Google3DView = dynamic(() => import("./Google3DView"), { ssr: false, loading: () => <div className="absolute inset-0 bg-surface" /> });
const MapView = dynamic(() => import("./MapView"), { ssr: false, loading: () => <div className="absolute inset-0 bg-surface" /> });

const NO_HOTSPOTS: Hotspot[] = [];

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

/** Map layers you can switch on and off (each is a layer on the map and its own legend). */
const LAYERS = [["events", "Events"], ["food", "Free food"], ["games", "Live games"], ["crowds", "Crowds"], ["safety", "Safety"], ["schedule", "My classes"], ["webcams", "Cams"]] as const;

export default function App() {
  const { weather, demo: weatherDemo } = useCampusWeather(); // live campus weather; W cycles demo weather, Shift+W goes back to live
  const [state, setState] = useState<AppState | null>(null);
  const [tab, setTab] = useState<Tab>("menu");
  const [menuOpen, setMenuOpen] = useState(false); // the side panel: pushes the map on desktop, bottom sheet on phones
  const [signedIn, setSignedIn] = useState<boolean | null>(null); // null while the saved session is being checked
  const [accountOpen, setAccountOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false); // Find friends sheet
  const grip = useRef<number | null>(null); // where a drag on the phone sheet's handle started
  const menuButton = useRef<HTMLButtonElement>(null);
  const [accountTab, setAccountTab] = useState<"account" | "inbox" | "notifications">("account");
  const accountArea = useRef<HTMLDivElement>(null);
  const accountButton = useRef<HTMLButtonElement>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [loc, setLoc] = useState<Loc>(START_LOC);
  const locRef = useRef(loc);
  useEffect(() => { locRef.current = loc; }, [loc]);
  const [gps, setGps] = useState<"off" | "asking" | "on">("off"); // "on" once we have a real fix
  const [layers, setLayers] = useState<MapLayers>({ events: true, hotspots: true, columns: false, places: false });
  const [view, setView] = useState<"map" | "3d">("map");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!filtersOpen) return;
    const away = (e: PointerEvent) => { if (!filterBox.current?.contains(e.target as Node)) setFiltersOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setFiltersOpen(false); };
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("pointerdown", away); window.removeEventListener("keydown", esc); };
  }, [filtersOpen]); // the layer chips stay tucked away until the filter button opens them
  const [chipState, setChips] = useState<ChipState>({ games: true, events: true, food: true, crowds: true, safety: true, schedule: true, webcams: true });
  const [selAlert, setSelAlert] = useState<string | null>(null);
  const [cam, setCam] = useState<Webcam | null>(null);
  const [satLoaded, setSatLoaded] = useState(false); // photoreal tiles loaded enough to show
  // Satellite stays loaded once opened (desktop): Google bills every fresh start of the 3D tiles, so never reload it per switch or hover
  const [keepSat, setKeepSat] = useState(false);
  // map lighting follows the real sun over campus; rechecked every minute
  // (read in the browser, not during the prerender; the map mounts after the first data load, so it starts in the right light)
  const [sunLight, setSunLight] = useState<LightPreset>("day");
  useEffect(() => {
    const tick = () => setSunLight(lightFor(new Date()));
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 60_000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, []);
  // "Map lighting" in Settings: Auto follows the real sun, or hold one time of day (read in the browser, after the prerender)
  const [lightTest, setLightTest] = useState<MapLighting>("auto");
  const [showPeople, setShowPeople] = useState(true); // "Show people on the map" in Settings
  useEffect(() => { const t = setTimeout(() => { setLightTest(loadMapLighting()); setShowPeople(loadShowPeople()); }, 0); return () => clearTimeout(t); }, []);
  // the Map lighting setting wins; then demo weather (W key: its "night" turns the map to night); otherwise the real sun
  const light: LightPreset = lightTest !== "auto" ? lightTest : weatherDemo ? (weather.isDay ? "day" : "night") : sunLight;
  // the page behind the map (what shows under Safari's bottom bar and the home indicator) matches the map, not a white strip
  useEffect(() => {
    const bg = light === "night" ? "#22263a" : light === "dusk" || light === "dawn" ? "#3a3550" : "";
    document.documentElement.style.backgroundColor = bg;
    document.body.style.backgroundColor = bg;
    return () => { document.documentElement.style.backgroundColor = ""; document.body.style.backgroundColor = ""; };
  }, [light]);
  // campus glide on first load (bubbles wait for it); phones skip it and land straight on the map
  const [intro, setIntro] = useState(() => typeof window === "undefined" || !window.matchMedia("(max-width: 900px), (pointer: coarse)").matches);
  useEffect(() => { const t = setTimeout(() => setIntro(false), 6000); return () => clearTimeout(t); }, []); // never hold bubbles back longer // start loading Satellite in the background (on hover)
  const threeReady = view === "3d" && satLoaded;
  const [flatGone, setFlatGone] = useState(false); // flat satellite placeholder removed after the fade
  const camera = useRef<Camera | null>(null); // shared so switching views keeps the same spot
  const [camBus] = useState<CameraBus>(() => ({ listeners: new Set() }));
  const [startCam, setStartCam] = useState<Camera | null>(null); // camera snapshot taken when switching views
  const [selEvent, setSelEvent] = useState<string | null>(null);
  const [selBuilding, setSelBuilding] = useState<string | null>(null);
  // a host's page (club, org, department): opened from an event's Host line; Back returns to that event
  const [selHost, setSelHost] = useState<{ host: HostRef; from: string | null } | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lng: number; zoom?: number; key: number } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [toasts, setToasts] = useState<Notification[]>([]);
  const [google, setGoogle] = useState<{ configured: boolean; connected: boolean; lastSync: string | null } | null>(null);
  const [googlePrefill, setGooglePrefill] = useState<GooglePrefill | null>(null);
  const [askRes, setAskRes] = useState<AskRes | null>(null);
  const [tick, setTick] = useState(0);
  const [walk, setWalk] = useState<{ toId: string; key: number; to?: Building } | null>(null);
  // where the walk goes: a campus building, or any point the assistant found (an address, a shop)
  const walkTo = walk ? walk.to ?? BUILDING_BY_ID[walk.toId] ?? null : null;
  const seenNotifs = useRef<Set<string> | null>(null);
  const focusSeq = useRef(0); // makes every fly-to a new object, even to the same spot

  function switchView(v: "map" | "3d") {
    if (v === view) return;
    setStartCam(camera.current);
    setFlatGone(false);
    if (v === "map") { if (SAT_PHONE) setSatLoaded(false); } // phones free the GPU when leaving Satellite; desktops keep it
    else { setKeepSat(!SAT_PHONE); if (satLoaded) setTimeout(() => setFlatGone(true), 800); } // already loaded: fade straight in
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
      // where you are goes along, so "starts in 20 min" reminders can say how long the walk is
      const here = `lat=${locRef.current.lat.toFixed(5)}&lng=${locRef.current.lng.toFixed(5)}`;
      const r = await api<{ notifications: Notification[]; unread: number }>(since ? `/api/notifications?since=${encodeURIComponent(since)}&${here}` : `/api/notifications?${here}`);
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
    // load the data right away: the session cookie already says who you are; the saved sign-in is re-checked alongside
    const t = setTimeout(() => {
      refresh();
      if (!saved) { setSignedIn(false); return; }
      setSignedIn(true);
      signIn(saved).then(async () => {
        if (saved.calendarUrl) { await syncCalendar(saved.calendarUrl).catch(() => null); refresh(); } // re-sync if the server forgot it
      }, () => { setSignedIn(false); refresh(); });
    }, 0);
    return () => clearTimeout(t);
  }, [refresh, loadGoogle]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") {
      if (accountOpen) { setAccountOpen(false); accountButton.current?.focus(); }
      else if (menuOpen) { setMenuOpen(false); menuButton.current?.focus(); }
    } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [accountOpen, menuOpen]);
  // the account panel closes when you click the map or anything else outside it
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
    setSelBuilding(null); setSelHost(null); setSelEvent(id); setMenuOpen(true); // details show in the side panel
    if (e?.lat != null && e.lng != null) setFocus({ lat: e.lat, lng: e.lng, key: ++focusSeq.current });
  };
  const openBuilding = (id: string) => {
    const b = BUILDING_BY_ID[id];
    setSelEvent(null); setSelHost(null); setSelBuilding(id); setMenuOpen(true);
    if (b) setFocus({ lat: b.lat, lng: b.lng, key: ++focusSeq.current });
  };
  const closeDetail = () => { setSelEvent(null); setSelBuilding(null); setSelAlert(null); setSelHost(null); };
  const openHost = (host: HostRef) => { setSelHost({ host, from: selEvent }); setSelEvent(null); setSelBuilding(null); setSelAlert(null); setMenuOpen(true); };

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
    else if (a.type === "walk_point") { setSelEvent(null); setSelBuilding(null); setWalk({ toId: "point", to: { id: "point", code: "", name: a.name, lat: a.lat, lng: a.lng, kind: "outdoor", capacity: 0, minor: true }, key: ++focusSeq.current }); }
    else { const b = BUILDING_BY_ID[a.buildingId]; if (b) setFocus({ lat: b.lat, lng: b.lng, zoom: 17, key: ++focusSeq.current }); }
  }
  // Live location: once signed in, ask for location (the phone shows its Allow prompt) and keep following you.
  // On campus your spot updates as you move (and the map centers on you once); off campus keeps the demo spot.
  useEffect(() => {
    if (!signedIn || typeof navigator === "undefined" || !navigator.geolocation) return;
    let centered = false;
    const id = navigator.geolocation.watchPosition((p) => {
      const here = { lat: p.coords.latitude, lng: p.coords.longitude };
      const nearest = [...BUILDINGS].sort((a, b) => distanceMeters(here, a) - distanceMeters(here, b))[0];
      if (distanceMeters(here, nearest) > 1500) { setGps("off"); return; } // off campus: keep the demo location
      // small GPS jitter doesn't re-render everything
      setLoc((prev) => (prev.buildingId === nearest.id && distanceMeters(prev, here) < 15 ? prev : { ...here, label: `near ${nearest.name}`, buildingId: nearest.id }));
      setGps("on");
      if (!centered) { centered = true; setFocus({ lat: here.lat, lng: here.lng, zoom: 17, key: ++focusSeq.current }); }
    }, () => setGps("off"), { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [signedIn]);

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
  const detailOpen = !!(event || selBuilding || openAlert || selHost);

  // the app is pinned to all four screen edges: on iPhone home-screen apps 100dvh comes up short by the
  // status bar's height (a blank strip at the bottom), and in Safari the toolbar comes and goes
  return (
    <div className="map-app fixed inset-0 overflow-hidden bg-background" data-night={light === "night"}>
      {/* Header */}
      {/* Floating glass header over the full-screen map */}
      {/* No header: the menu button sits top-left; your profile (with inbox and notifications inside it) floats top-right */}
      <WeatherPill weather={weather} />
      <div ref={accountArea} className="account-area">
        {/* notifications, beside your profile; opens the same panel on its Notifications tab */}
        <button onClick={() => { setAccountOpen((o) => !(o && accountTab === "notifications")); setAccountTab("notifications"); }} className="map-bell" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}>
          <Bell size={18} strokeWidth={2} />
          {unread > 0 && <span className="bell-unread" />}
        </button>
        <button ref={accountButton} onClick={() => { setAccountOpen((o) => !o); setAccountTab("account"); }} title={state?.me.name ?? "Account"} aria-label="Account" aria-expanded={accountOpen} aria-controls="account-panel" className="map-profile">
          {state?.me.avatar ?? <UserRound size={16} />}
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
                <button onClick={() => { setAccountOpen(false); setFindOpen(true); }} className="menu-item"><UserPlus size={17} /> Find friends</button>
                <Link href="/settings" onClick={() => setAccountOpen(false)} className="menu-item"><Settings size={17} /> Settings</Link>
                <Link href="/dashboard" onClick={() => setAccountOpen(false)} className="menu-item"><LayoutDashboard size={17} /> Organizer dashboard</Link>
                <div className="menu-sep" />
                <button className="menu-item text-cardinal" onClick={() => { clearSession(); void api("/api/session", { json: { action: "signout" } }).then(refresh); setAccountOpen(false); setMenuOpen(false); setSignedIn(false); }}><LogOut size={17} /> Sign out</button>
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
      {findOpen && <FindFriends me={state?.me.username} onClose={() => setFindOpen(false)} onChanged={refresh} />}

      <div className="absolute inset-0">
        {/* Sidebar */}
        {/* Menu panel (see .side in globals.css): opened by the menu button, pushes the map on desktop, bottom sheet on phones */}
        <aside id="campus-menu" aria-label="Campus menu" className={cx("side", menuOpen && "side-open")}>
          <div className="side-inner">
          <button className="side-grip" aria-label="Collapse menu" onClick={() => setMenuOpen(false)}
            onPointerDown={(e) => { grip.current = e.clientY; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerUp={(e) => { if (grip.current != null && e.clientY - grip.current > 50) setMenuOpen(false); grip.current = null; }} />
          {/* always-visible bar: tap a tab to unfold the panel on it, tap the open tab (or the chevron) to fold it */}
          <nav className="side-bar" aria-label="Panel sections">
            {([["menu", "Home", House], ["events", "Events", CalendarDays], ["study", "Study spots", BookOpen]] as const).map(([t, l, Icon]) => {
              const on = tab === t && menuOpen && !detailOpen;
              return (
                <button key={t} aria-pressed={on} onClick={() => { closeDetail(); if (on) setMenuOpen(false); else { setTab(t); setMenuOpen(true); } }}
                  className={cx("side-tab", on && "side-tab-on")}>
                  <Icon size={15} aria-hidden="true" /> <span>{l}</span>
                </button>
              );
            })}
            <button ref={menuButton} onClick={() => setMenuOpen((o) => !o)} className="side-chevron" aria-label={menuOpen ? "Fold up the panel" : "Open the panel"} aria-expanded={menuOpen} aria-controls="campus-menu-content">
              <ChevronDown size={18} className={cx("transition-transform duration-300", menuOpen && "rotate-180")} />
            </button>
          </nav>
          <div id="campus-menu-content" inert={!menuOpen} className={cx("min-h-0 flex-1 p-4", !detailOpen && tab === "events" ? "overflow-hidden" : "scroll-thin overflow-y-auto")}>
            {!state ? (
              <div className="space-y-2"><div className="skeleton h-24" /><div className="skeleton h-16" /><div className="skeleton h-16" /></div>
            ) : openAlert ? (
              <AlertDetail alert={openAlert} now={now} onClose={closeDetail} />
            ) : selHost ? (
              <OrgDetail host={selHost.host} state={state} loc={loc} onOpenEvent={openEvent}
                onClose={() => { const from = selHost.from; setSelHost(null); if (from) openEvent(from); }} />
            ) : event ? (
              <EventDetail ev={event} state={state} loc={loc} onOpenHost={openHost} onClose={closeDetail} onRsvp={rsvp} onUpdated={(e) => setState((s) => (s ? { ...s, events: s.events.map((x) => (x.id === e.id ? e : x)) } : s))} onInvite={invite} onFindFriends={() => setFindOpen(true)} onOpenBuilding={openBuilding} onDirections={(bid) => { if (bid !== loc.buildingId) setWalk({ toId: bid, key: ++focusSeq.current }); }} />
            ) : selBuilding ? (
              <BuildingDetail id={selBuilding} loc={loc} now={now} tick={tick} onClose={closeDetail} onOpenEvent={openEvent} onWalk={(bId) => chatAction({ type: "walk", buildingId: bId })} />
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
          {/* the map starts loading immediately, in parallel with the data (it fills in when the data arrives) */}
          {(view === "map" || !flatGone) && (
            <MapView
              weather={weather}
              events={shownEvents}
              hotspots={state?.hotspots ?? NO_HOTSPOTS}
              buildings={BUILDINGS}
              me={loc}
              layers={mapLayers}
              people={showPeople}
              onLocate={locateMe}
              gps={gps}
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
              walk={view === "map" && walk && walkTo ? { to: walkTo, key: walk.key } : null}
              onWalkEnd={endWalk}
            />
          )}
          {(view === "3d" || keepSat) && (
            <div className="absolute inset-0 z-[1] transition-opacity duration-700" style={{ opacity: threeReady ? 1 : 0, pointerEvents: threeReady ? "auto" : "none" }}>
              <Google3DView
                weather={weather}
                active={view === "3d"}
                events={shownEvents}
                buildings={BUILDINGS}
                me={loc}
                selectedEventId={selEvent}
                highlightIds={highlight}
                focus={view === "3d" ? focus : null}
                onSelectEvent={openEvent}
                onSelectBuilding={openBuilding}
                initialCamera={startCam}
                follow={camBus}
                onReady={() => { setSatLoaded(true); if (view === "3d") setTimeout(() => setFlatGone(true), 800); }}
                onCamera={(c) => { camera.current = c; }}
                walk={view === "3d" && walk && walkTo ? { to: walkTo, key: walk.key } : null}
                onWalkEnd={endWalk}
                callouts={walk ? noCallouts : callouts}
                alerts={shownAlerts}
                hotspots={state?.hotspots ?? NO_HOTSPOTS}
                showHeat={chips.crowds}
                onCallout={onCallout}
              />
            </div>
          )}
          {view === "3d" && !threeReady && (
            <div className="glass absolute left-1/2 top-[calc(6rem+var(--sat))] z-10 -translate-x-1/2 rounded-full px-3 py-1 text-xs text-muted">Loading 3D campus…</div>
          )}

          {/* Explore / Satellite: icon-only switch in the bottom-left corner (names show as tooltips) */}
          <div className="view-switch" role="group" aria-label="Map view">
            {([["map", "Explore", MapIcon], ["3d", "Satellite", Satellite]] as const).map(([k, l, Icon]) => (
              <button key={k} type="button" aria-label={l} aria-pressed={view === k} data-tip={l} onClick={() => switchView(k)}>
                <Icon size={19} aria-hidden="true" />
              </button>
            ))}
          </div>


          {/* Bottom dock: locate + one filter row (each chip is a layer on the map and its legend), then search and assistant in one bar */}
          <div className="map-dock">
            <div className="dock-inner">
              <div className="dock-search-row">
                {/* map layers: a small glass button; it opens a glass popup where each layer is a pill you tap on or off */}
                <div ref={filterBox} className="filter-wrap">
                  {filtersOpen && (
                    <div id="map-layer-chips" className="filter-pop" role="group" aria-label="Map layers">
                      {LAYERS.map(([k, l]) => (
                        <button key={k} type="button" aria-pressed={chips[k]} className="filter-pill" onClick={() => setChips((c) => ({ ...c, [k]: !c[k] }))}>{l}</button>
                      ))}
                    </div>
                  )}
                  <button type="button" onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen} aria-controls="map-layer-chips"
                    aria-label={filtersOpen ? "Hide map layers" : "Show map layers"} title="Map layers" className={cx("dock-filter", filtersOpen && "dock-filter-on")}>
                    <SlidersHorizontal size={19} aria-hidden="true" />
                    {LAYERS.some(([k]) => !chips[k]) && <span className="dock-filter-dot" aria-hidden="true" />}
                  </button>
                </div>
                {state && (
                  <ChatDock events={state.events} loc={loc} now={now} onAction={chatAction} onOpenBuilding={openBuilding}
                    onAnswer={(ids) => setAskRes(ids ? { answer: "", eventIds: ids, buildingIds: [], focusBuildingId: "none", ai: true } : null)}
                    onChanged={() => { refresh(); pollNotifs(); }} />
                )}
              </div>
            </div>
          </div>

          {/* new notifications: top right, just left of the bell (and the weather under it); clicking one opens it and clears it */}
          <div className="toast-stack" aria-live="polite">
            {toasts.map((n) => (
              <button key={n.id} type="button" className="toast"
                onClick={() => {
                  if (n.eventId) openEvent(n.eventId); else if (n.buildingId) openBuilding(n.buildingId);
                  setToasts((t) => t.filter((x) => x.id !== n.id));
                  void api("/api/notifications", { json: { ids: [n.id] } }).then(() => pollNotifs(), () => {}); // read, so the bell's dot updates
                }}>
                <span className="toast-ic" aria-hidden="true"><Bell size={16} strokeWidth={2.2} /></span>
                <span className="toast-text">
                  <span className="block text-sm font-semibold">{n.title}</span>
                  {n.body && <span className="toast-body block">{n.body}</span>}
                </span>
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
