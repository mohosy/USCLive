/**
 * Turns calendar entries (from an iCal link or Google Calendar) into private map events and deadline notifications.
 * Shared rules: deadlines become notifications; entries are placed on a campus building only from their location
 * (online meetings never); anything that can't be placed is listed back instead of being pinned somewhere wrong.
 */
import { detectFoodHeuristic } from "./ai";
import { BUILDING_BY_ID, matchBuilding } from "./campus";
import { addNotification, db, getMe, newId } from "./store";
import type { CampusEvent, EventSource } from "./types";

export interface CalItem { title: string; location: string; description: string; start: Date; end: Date; allDay: boolean }
export interface ImportResult { added: number; deadlines: number; skipped: number; unplaced: { title: string; start: string; location: string }[] }

export function importCalendarItems(items: CalItem[], source: Extract<EventSource, "brightspace" | "calendar">, opts: { replace?: boolean; notify?: boolean } = {}): ImportResult {
  const me = getMe();
  const d = db();
  const mine = (e: CampusEvent) => e.source === source && e.invitees.includes(me.id) && e.tags.includes("imported");
  // live sync: the calendar is the truth, so moved or deleted entries disappear too
  if (opts.replace) d.events = d.events.filter((e) => !mine(e));
  const haveEvent = new Set(d.events.filter(mine).map((e) => `${e.title}|${e.start}`));
  const haveDeadline = new Set(d.notifications.filter((n) => n.kind === "deadline").map((n) => `${n.title}|${n.dueAt}`));
  const unplaced = new Map<string, ImportResult["unplaced"][number]>();
  let added = 0, deadlines = 0, skipped = 0;

  for (const it of items.slice(0, 400)) { // a calendar can't flood the map
    const summary = it.title.trim() || "Untitled";
    const course = summary.match(/\b([A-Z]{2,4})[-\s]?(\d{3}[A-Z]?)\b/);
    const isDue = /\bdue\b|deadline|submission|quiz closes|assignment/i.test(summary + it.description) || +it.end - +it.start === 0;
    const key = `${summary}|${it.start.toISOString()}`;
    if (isDue) {
      if (haveDeadline.has(key)) { skipped++; continue; }
      haveDeadline.add(key);
      addNotification({ kind: "deadline", title: summary, body: course ? `${course[1]} ${course[2]}` : "From your calendar", dueAt: it.start.toISOString(), source: source === "calendar" ? "gcal" : "brightspace" });
      deadlines++;
      continue;
    }
    if (it.allDay) continue; // holidays, "no class" days
    if (haveEvent.has(key)) { skipped++; continue; }
    // online meetings never get a building; the title is only a fallback, and only for main campus buildings
    const online = /zoom|teams|google meet|meet\.google|webex|online|virtual|https?:\/\//i.test(it.location);
    const fromTitle = !it.location ? matchBuilding(summary) : null;
    const buildingId = online ? null : matchBuilding(it.location) ?? (fromTitle && !BUILDING_BY_ID[fromTitle]?.minor ? fromTitle : null);
    if (!buildingId) { if (!unplaced.has(summary)) unplaced.set(summary, { title: summary, start: it.start.toISOString(), location: it.location }); continue; }
    haveEvent.add(key);
    const food = detectFoodHeuristic(summary + " " + it.description);
    d.events.push({
      id: newId("ev"), title: summary, description: it.description.slice(0, 400), category: course ? "academic" : "student", buildingId, room: it.location || undefined,
      start: it.start.toISOString(), end: it.end.toISOString(), host: { kind: "usc", name: "Your calendar" }, visibility: "invite", schools: ["all"],
      course: course ? `${course[1]} ${course[2]}` : undefined, invitees: [me.id], attendees: [me.id], freeFood: food.freeFood, foodDetail: food.foodDetail ?? undefined,
      tags: ["imported"], source, moderation: { status: "approved", reasons: [], riskScore: 0, checkedBy: "rules" }, createdAt: new Date().toISOString(),
    });
    added++;
  }
  if (opts.notify !== false && (added || deadlines)) addNotification({ kind: "system", title: "Calendar synced", body: `${added} events on your map · ${deadlines} deadlines tracked`, source: source === "calendar" ? "gcal" : "brightspace" });
  return { added, deadlines, skipped, unplaced: [...unplaced.values()].slice(0, 12) };
}
