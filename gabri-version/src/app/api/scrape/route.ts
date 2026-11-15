import { z } from "zod";
import { extractEventsFromPage, ruleModeration } from "@/lib/ai";
import { body, fetchText, safeExternalUrl, toIso } from "@/lib/http";
import { addNotification, db, newId } from "@/lib/store";
import type { CampusEvent } from "@/lib/types";
import { withState } from "@/lib/state";

// Only scrape USC-owned public pages.
const ALLOW = /(^|\.)usc\.edu$/i;
export const DEFAULT_SOURCES = ["https://calendar.usc.edu/"]; // usc.edu/events was retired (404)

function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

async function POST_(req: Request) {
  const parsed = await body(req, z.object({ url: z.string().max(500).optional() }));
  if (!parsed.ok) return parsed.res;
  const urls = parsed.data.url ? [parsed.data.url] : DEFAULT_SOURCES;
  const report: { url: string; found: number; added: number; error?: string }[] = [];
  let anyAi = false;

  for (const raw of urls) {
    const u = safeExternalUrl(raw, ALLOW);
    if (!u) {
      report.push({ url: raw, found: 0, added: 0, error: "Only https://*.usc.edu pages can be scraped" });
      continue;
    }
    try {
      const text = htmlToText(await fetchText(u));
      const res = await extractEventsFromPage(text, u.toString());
      anyAi ||= res.ai;
      let added = 0;
      for (const x of res.data.events) {
        if (!x.isEvent || x.buildingId === "unknown") continue;
        const start = toIso(x.start), end = toIso(x.end);
        if (!start || !end) continue;
        if (db().events.some((e) => e.title.toLowerCase() === x.title.toLowerCase() && e.start === start)) continue;
        const mod = ruleModeration(`${x.title}\n${x.description}`);
        const ev: CampusEvent = {
          id: newId("ev"), title: x.title, description: x.description, category: x.category, buildingId: x.buildingId, room: x.room ?? undefined,
          start, end, host: { kind: "usc", name: x.hostName ?? u.hostname }, visibility: "public", schools: x.schools.length ? x.schools : ["all"],
          course: x.course ?? undefined, invitees: [], attendees: [], freeFood: x.freeFood, foodDetail: x.foodDetail ?? undefined, tags: [...x.tags, "scraped"],
          source: "scrape", moderation: { status: mod.status, reasons: mod.reasons, riskScore: mod.riskScore, checkedBy: "rules" }, createdAt: new Date().toISOString(),
        };
        db().events.push(ev);
        added++;
      }
      report.push({ url: u.toString(), found: res.data.events.length, added, error: res.error });
    } catch (e) {
      report.push({ url: u.toString(), found: 0, added: 0, error: (e as Error).message });
    }
  }
  const total = report.reduce((s, r) => s + r.added, 0);
  if (total) addNotification({ kind: "system", title: `Scraped ${total} new USC events`, body: report.map((r) => new URL(r.url).hostname).join(", "), source: "live" });
  return Response.json({ report, ai: anyAi });
}

export const POST = withState(POST_);
