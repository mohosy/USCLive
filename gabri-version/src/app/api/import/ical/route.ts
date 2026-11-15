import ical from "node-ical";
import { z } from "zod";
import { detectFoodHeuristic } from "@/lib/ai";
import { BUILDING_BY_ID, matchBuilding } from "@/lib/campus";
import { body, fetchText, safeExternalUrl } from "@/lib/http";
import { addNotification, db, getMe, newId } from "@/lib/store";
import type { CampusEvent } from "@/lib/types";

/**
 * Import a Brightspace (or Google/Outlook) calendar via its private iCal subscription URL.
 * Brightspace: Calendar → Subscribe → copy the feed URL. No API approval needed.
 * Imported items are private to the student (visibility "invite", only them). Repeating entries (weekly classes)
 * are expanded into every occurrence in the next two weeks; entries with no campus location are listed back, not dropped silently.
 */
export async function POST(req: Request) {
  const parsed = await body(req, z.object({ url: z.string().min(10).max(2000).optional(), ics: z.string().max(2_000_000).optional() }));
  if (!parsed.ok) return parsed.res;
  let text = parsed.data.ics;
  if (!text) {
    const u = parsed.data.url ? safeExternalUrl(parsed.data.url) : null;
    if (!u) return Response.json({ error: "Provide a public https/webcal calendar URL" }, { status: 400 });
    try {
      text = await fetchText(u);
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 502 });
    }
  }
  const me = getMe();
  const now = Date.now();
  const horizon = now + 14 * 24 * 3600_000;
  const parsedCal = ical.sync.parseICS(text);
  let added = 0, deadlines = 0, skipped = 0;
  const d = db();
  const haveEvent = new Set(d.events.filter((e) => e.source === "brightspace" && e.invitees.includes(me.id)).map((e) => `${e.title}|${e.start}`));
  const haveDeadline = new Set(d.notifications.filter((n) => n.kind === "deadline").map((n) => `${n.title}|${n.dueAt}`));
  const unplaced = new Map<string, { title: string; start: string; location: string }>(); // one row per title, not per weekly repeat
  const str = (v: unknown) => String(typeof v === "object" && v ? (v as { val: string }).val : v ?? "");
  let budget = 400; // a calendar can't flood the map

  for (const comp of Object.values(parsedCal)) {
    if (!comp || comp.type !== "VEVENT" || comp.recurrenceid) continue; // one-off changes are applied by the expansion below
    // every occurrence in the next two weeks: weekly classes are one repeating entry in a calendar
    let instances: ReturnType<typeof ical.expandRecurringEvent> = [];
    try { instances = ical.expandRecurringEvent(comp, { from: new Date(now - 3600_000), to: new Date(horizon), maxIterations: 2000 }); } catch { continue; }
    for (const inst of instances) {
      if (budget-- <= 0) break;
      const start = new Date(inst.start), end = inst.end ? new Date(inst.end) : new Date(+start + 3600_000);
      const src = inst.event;
      const summary = str(src.summary) || "Untitled";
      const location = str(src.location);
      const desc = str(src.description);
      const course = summary.match(/\b([A-Z]{2,4})[-\s]?(\d{3}[A-Z]?)\b/);
      const isDue = /\bdue\b|deadline|submission|quiz closes|assignment/i.test(summary + desc) || +end - +start === 0;
      const key = `${summary}|${start.toISOString()}`;

      if (isDue) {
        if (haveDeadline.has(key)) { skipped++; continue; }
        haveDeadline.add(key);
        addNotification({ kind: "deadline", title: summary, body: course ? `${course[1]} ${course[2]}` : "From your calendar", dueAt: start.toISOString(), source: "brightspace" });
        deadlines++;
        continue;
      }
      if (inst.isFullDay) continue; // holidays, "no class" days
      if (haveEvent.has(key)) { skipped++; continue; }
      // online meetings never get a building; the title is only a fallback, and only for main campus buildings
      const online = /zoom|teams|google meet|meet\.google|webex|online|virtual|https?:\/\//i.test(location);
      const fromTitle = !location ? matchBuilding(summary) : null;
      const buildingId = online ? null : matchBuilding(location) ?? (fromTitle && !BUILDING_BY_ID[fromTitle]?.minor ? fromTitle : null);
      if (!buildingId) { if (!unplaced.has(summary)) unplaced.set(summary, { title: summary, start: start.toISOString(), location }); continue; }
      haveEvent.add(key);
      const food = detectFoodHeuristic(summary + " " + desc);
      const ev: CampusEvent = {
        id: newId("ev"), title: summary, description: desc.slice(0, 400), category: course ? "academic" : "student", buildingId, room: location || undefined,
        start: start.toISOString(), end: end.toISOString(), host: { kind: "usc", name: "Your calendar" }, visibility: "invite", schools: ["all"],
        course: course ? `${course[1]} ${course[2]}` : undefined, invitees: [me.id], attendees: [me.id], freeFood: food.freeFood, foodDetail: food.foodDetail ?? undefined,
        tags: ["imported"], source: "brightspace", moderation: { status: "approved", reasons: [], riskScore: 0, checkedBy: "rules" }, createdAt: new Date().toISOString(),
      };
      d.events.push(ev);
      added++;
    }
  }
  if (added || deadlines) addNotification({ kind: "system", title: "Calendar synced", body: `${added} events on your map · ${deadlines} deadlines tracked`, source: "brightspace" });
  return Response.json({ added, deadlines, skipped, unplaced: [...unplaced.values()].slice(0, 12) });
}
