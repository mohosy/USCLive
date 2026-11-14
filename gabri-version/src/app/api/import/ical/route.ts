import ical from "node-ical";
import { z } from "zod";
import { detectFoodHeuristic } from "@/lib/ai";
import { matchBuilding } from "@/lib/campus";
import { body, fetchText, safeExternalUrl } from "@/lib/http";
import { addNotification, db, getMe, newId } from "@/lib/store";
import type { CampusEvent } from "@/lib/types";

/**
 * Import a Brightspace (or Google/Outlook) calendar via its private iCal subscription URL.
 * Brightspace: Calendar → Subscribe → copy the feed URL. No API approval needed.
 * Imported items are private to the student (visibility "invite", only them).
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
  let added = 0, deadlines = 0;

  for (const comp of Object.values(parsedCal)) {
    if (!comp || comp.type !== "VEVENT") continue;
    const start = comp.start ? new Date(comp.start as Date) : null;
    if (!start || +start < now - 3600_000 || +start > horizon) continue;
    const end = comp.end ? new Date(comp.end as Date) : new Date(+start + 3600_000);
    const summary = String(typeof comp.summary === "object" ? (comp.summary as { val: string }).val : comp.summary ?? "Untitled");
    const location = String(typeof comp.location === "object" ? (comp.location as { val: string }).val : comp.location ?? "");
    const desc = String(typeof comp.description === "object" ? (comp.description as { val: string }).val : comp.description ?? "");
    const course = summary.match(/\b([A-Z]{2,4})[-\s]?(\d{3}[A-Z]?)\b/);
    const isDue = /\bdue\b|deadline|submission|quiz closes|assignment/i.test(summary + desc) || +end - +start === 0;

    if (isDue) {
      addNotification({ kind: "deadline", title: summary, body: course ? `${course[1]} ${course[2]}` : "From your calendar", dueAt: start.toISOString(), source: "brightspace" });
      deadlines++;
      continue;
    }
    const buildingId = matchBuilding(location) ?? matchBuilding(summary);
    if (!buildingId) continue;
    const food = detectFoodHeuristic(summary + " " + desc);
    const ev: CampusEvent = {
      id: newId("ev"), title: summary, description: desc.slice(0, 400), category: course ? "academic" : "social", buildingId, room: location || undefined,
      start: start.toISOString(), end: end.toISOString(), host: { kind: "usc", name: "Your calendar" }, visibility: "invite", schools: ["all"],
      course: course ? `${course[1]} ${course[2]}` : undefined, invitees: [me.id], attendees: [me.id], freeFood: food.freeFood, foodDetail: food.foodDetail ?? undefined,
      tags: ["imported"], source: "brightspace", moderation: { status: "approved", reasons: [], riskScore: 0, checkedBy: "rules" }, createdAt: new Date().toISOString(),
    };
    db().events.push(ev);
    added++;
  }
  if (added || deadlines) addNotification({ kind: "system", title: "Calendar synced", body: `${added} events on your map · ${deadlines} deadlines tracked`, source: "brightspace" });
  return Response.json({ added, deadlines });
}
