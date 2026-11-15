import ical from "node-ical";
import { z } from "zod";
import { importCalendarItems, type CalItem } from "@/lib/calendarImport";
import { body, fetchText, safeExternalUrl } from "@/lib/http";

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
  const now = Date.now();
  const horizon = now + 14 * 24 * 3600_000;
  const parsedCal = ical.sync.parseICS(text);
  const str = (v: unknown) => String(typeof v === "object" && v ? (v as { val: string }).val : v ?? "");
  const items: CalItem[] = [];
  for (const comp of Object.values(parsedCal)) {
    if (!comp || comp.type !== "VEVENT" || comp.recurrenceid) continue; // one-off changes are applied by the expansion below
    // every occurrence in the next two weeks: weekly classes are one repeating entry in a calendar
    let instances: ReturnType<typeof ical.expandRecurringEvent> = [];
    try { instances = ical.expandRecurringEvent(comp, { from: new Date(now - 3600_000), to: new Date(horizon), maxIterations: 2000 }); } catch { continue; }
    for (const inst of instances) {
      const start = new Date(inst.start);
      items.push({ title: str(inst.event.summary), location: str(inst.event.location), description: str(inst.event.description), start, end: inst.end ? new Date(inst.end) : new Date(+start + 3600_000), allDay: inst.isFullDay });
    }
  }
  return Response.json(importCalendarItems(items, "brightspace"));
}
