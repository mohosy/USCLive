import type { Building, Category, ClassMeeting, Hotspot, Notification, Org, SafetyAlert, SchoolId } from "./types";
import type { PublicEvent } from "./store";

export type EventView = PublicEvent;

export interface MeView {
  id: string;
  /** Settings (your Trojan's look, privacy, notifications, map); unset = the defaults */
  prefs?: import("./types").UserPrefs;
  /** demo-directory account (school/major from the mock USC directory) */
  verified?: boolean;
  name: string;
  avatar: string;
  school: SchoolId;
  year: string;
  major: string;
  interests: string[];
  orgs: string[];
  classes: ClassMeeting[];
  friends: { id: string; name: string; avatar: string; school: SchoolId; username: string; photo?: string }[];
  today: { kind: "class" | "office_hours"; code: string; title: string; buildingId: string; room: string; start: string; end: string }[];
  freeMinutes: number;
  freeUntil: string | null;
  username?: string;
  email?: string;
  accountType?: "student" | "creator";
  creatorOrgId?: string;
  pronouns?: string;
  bio?: string;
  photo?: string;
}

export interface AppState {
  now: string;
  aiEnabled: boolean;
  me: MeView;
  events: EventView[];
  hotspots: Hotspot[];
  alerts: SafetyAlert[];
  orgs: Org[];
  unread: number;
}

export type { Building, Category, Hotspot, Notification, Org, SafetyAlert };

export interface Loc { lat: number; lng: number; label: string; buildingId?: string }

export interface Filters {
  categories: Category[];
  freeFood: boolean;
  friends: boolean;
  myClasses: boolean;
  school: SchoolId | "any";
  window: "now" | "today" | "week";
  q: string;
}

export const DEFAULT_FILTERS: Filters = { categories: [], freeFood: false, friends: false, myClasses: false, school: "any", window: "today", q: "" };

export function applyFilters(events: EventView[], f: Filters, now: Date) {
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  return events.filter((e) => {
    const s = +new Date(e.start), en = +new Date(e.end);
    if (en < +now) return false;
    if (f.window === "now" && !(s <= +now + 60 * 60_000)) return false;
    if (f.window === "today" && s > +endOfDay) return false;
    if (f.window === "week" && s > +now + 7 * 864e5) return false;
    if (f.categories.length && !f.categories.includes(e.category)) return false;
    if (f.freeFood && !e.freeFood) return false;
    if (f.friends && !e.friendsGoing.length) return false;
    if (f.myClasses && !e.isClassmate) return false;
    if (f.school !== "any" && !(e.schools.includes(f.school) || e.schools.includes("all"))) return false;
    if (f.q) {
      const hay = `${e.title} ${e.description} ${e.buildingName} ${e.course ?? ""} ${e.foodDetail ?? ""} ${e.host.name}`.toLowerCase();
      if (!f.q.toLowerCase().split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  });
}

export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
export function fmtWhen(iso: string, endIso?: string, now = new Date()) {
  const d = new Date(iso);
  const mins = Math.round((+d - +now) / 60_000);
  if (endIso && +d <= +now && +new Date(endIso) > +now) return `Live · until ${fmtTime(endIso)}`;
  if (mins > 0 && mins < 60) return `In ${mins} min`;
  const sameDay = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const day = sameDay ? "Today" : d.toDateString() === tomorrow.toDateString() ? "Tomorrow" : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return `${day} · ${fmtTime(iso)}`;
}
export const isLive = (e: { start: string; end: string }, now = new Date()) => +new Date(e.start) <= +now && +new Date(e.end) > +now;

export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    method: init?.method ?? (init?.json !== undefined ? "POST" : "GET"),
    headers: init?.json !== undefined ? { "Content-Type": "application/json" } : init?.headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}
