import { z } from "zod";
import { askMap, nowContext, type AskT } from "@/lib/ai";
import { BUILDINGS } from "@/lib/campus";
import { computeHotspots } from "@/lib/hotspots";
import { body } from "@/lib/http";
import { candidateEvents, freeWindow, hotspotLabel, studySpots, todaysClasses } from "@/lib/planner";
import { db, getMe } from "@/lib/store";

const Input = z.object({ question: z.string().trim().min(2).max(300), lat: z.number(), lng: z.number() });

export async function POST(req: Request) {
  const parsed = await body(req, Input);
  if (!parsed.ok) return parsed.res;
  const { question, lat, lng } = parsed.data;
  const me = getMe();
  const now = new Date();
  const loc = { lat, lng, label: "user" };
  const events = candidateEvents(me, loc, now, 60 * 24 * 7);
  const hs = computeHotspots(db().events, now);
  const fw = freeWindow(me, now);
  const fmt = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });

  const context = `${nowContext(now)}
STUDENT: ${me.name}, ${me.major}. Classes today: ${todaysClasses(me, now).map((c) => `${c.title} ${c.start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} @ ${c.room}`).join("; ") || "none"}. Free for ~${fw.minutes} min.
EVENTS (next 7 days):
${events.map((e) => `${e.id} | ${e.title} | ${e.category} | ${e.buildingName} (${e.buildingId}) | ${fmt(e.start)}-${fmt(e.end)} | ${e.walkMin} min walk | ${e.visibility}${e.course ? ` | course ${e.course}` : ""}${e.freeFood ? ` | FREE FOOD: ${e.foodDetail}` : ""}${e.friendsGoing.length ? ` | friends: ${e.friendsGoing.map((f) => f.name).join(", ")}` : ""} | ${e.attendeeCount} going`).join("\n")}
CROWDS NOW (building id | name | level):
${BUILDINGS.map((b) => `${b.id} | ${b.name} | ${hotspotLabel(hs.find((h) => h.buildingId === b.id)!)}`).join("\n")}
STUDY SPOTS (best first): ${studySpots(loc, now).slice(0, 5).map((s) => `${s.building.name} (${s.fill}% full, ${s.walk} min)`).join("; ")}`;

  const fallback = (): AskT => {
    const q = question.toLowerCase();
    const words = q.split(/\W+/).filter((w) => w.length > 2);
    let hits = events.filter((e) => {
      const hay = `${e.title} ${e.description} ${e.category} ${e.tags.join(" ")} ${e.foodDetail ?? ""} ${e.course ?? ""}`.toLowerCase();
      if (/food|eat|hungry|pizza|free/.test(q) && e.freeFood) return true;
      return words.some((w) => hay.includes(w));
    });
    if (/tonight/.test(q)) hits = hits.filter((e) => new Date(e.start).getDate() === now.getDate());
    if (/study|quiet/.test(q) && !hits.length) {
      const s = studySpots(loc, now).slice(0, 3);
      return { answer: `Quietest nearby: ${s.map((x) => `${x.building.name} (${x.fill}% full, ${x.walk} min)`).join(", ")}.`, eventIds: [], buildingIds: s.map((x) => x.building.id) as AskT["buildingIds"], focusBuildingId: s[0].building.id as AskT["focusBuildingId"] };
    }
    hits = hits.slice(0, 5);
    return {
      answer: hits.length ? `I found ${hits.length}: ${hits.map((h) => `${h.title} (${fmt(h.start)}, ${h.buildingName})`).join("; ")}.` : "Nothing matching right now. Try 'free food', 'pickup', or a class code.",
      eventIds: hits.map((h) => h.id),
      buildingIds: Array.from(new Set(hits.map((h) => h.buildingId))) as AskT["buildingIds"],
      focusBuildingId: (hits[0]?.buildingId ?? "none") as AskT["focusBuildingId"],
    };
  };

  const res = await askMap(question, context, fallback);
  const ids = new Set(events.map((e) => e.id));
  res.data.eventIds = res.data.eventIds.filter((id) => ids.has(id));
  return Response.json({ ...res.data, ai: res.ai, error: res.error });
}
