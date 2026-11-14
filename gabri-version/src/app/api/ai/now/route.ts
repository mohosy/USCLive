import { z } from "zod";
import { nowContext, planNow, type NowPlanT } from "@/lib/ai";
import { BUILDING_BY_ID, walkMinutes } from "@/lib/campus";
import { body } from "@/lib/http";
import { candidateEvents, freeWindow, heuristicRank, hotspotLabel, studySpots, todaysClasses } from "@/lib/planner";
import { db, getMe } from "@/lib/store";

const Input = z.object({ lat: z.number(), lng: z.number(), label: z.string().max(80).default("current location") });

export async function POST(req: Request) {
  const parsed = await body(req, Input);
  if (!parsed.ok) return parsed.res;
  const loc = parsed.data;
  const me = getMe();
  const now = new Date();
  const fw = freeWindow(me, now);
  const next = fw.next;
  const walkToNext = next ? walkMinutes(loc, BUILDING_BY_ID[next.buildingId]) : 0;
  const usable = next ? Math.max(0, fw.minutes - walkToNext - 5) : 240;
  const ranked = heuristicRank(me, candidateEvents(me, loc, now), usable).slice(0, 12);
  const spots = studySpots(loc, now).slice(0, 4);
  const deadlines = db().notifications.filter((n) => n.kind === "deadline").slice(0, 3);
  const fmt = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  const prompt = `${nowContext(now)}
STUDENT: ${me.name}, ${me.year} ${me.major}. Interests: ${me.interests.join(", ")}.
LOCATION: ${loc.label} (lat ${loc.lat.toFixed(4)}, lng ${loc.lng.toFixed(4)}).
TODAY: ${todaysClasses(me, now).map((c) => `${fmt(c.start)}-${fmt(c.end)} ${c.title} @ ${c.room}`).join("; ") || "no classes"}.
NEXT CLASS: ${next ? `${next.code} at ${fmt(next.start)} in ${next.room} — ${walkToNext} min walk from here. Free time before leaving: ~${usable} min.` : "none today — evening is free."}
UPCOMING DEADLINES: ${deadlines.map((d) => d.title + (d.dueAt ? ` (due ${new Date(d.dueAt).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })})` : "")).join("; ") || "none known"}.

CANDIDATE EVENTS (id | title | where | starts | walk | crowd | social signals):
${ranked.map((c) => `${c.id} | ${c.title} | ${c.buildingName}${c.room ? ` ${c.room}` : ""} | ${c.live ? `LIVE now (started ${-c.startsInMin} min ago)` : `in ${c.startsInMin} min`} | ${c.walkMin} min walk | ${c.crowd} | ${[
    c.going && "you're going", c.invited && "you're invited", c.friendsGoing.length && `friends: ${c.friendsGoing.map((f) => f.name.split(" ")[0]).join(", ")}`,
    c.isClassmate && `your class ${c.course}`, c.freeFood && `FREE FOOD: ${c.foodDetail}`, c.visibility === "open" && "open invite", `${c.attendeeCount} going`,
  ].filter(Boolean).join(", ")}`).join("\n")}

STUDY SPOTS (building id | name | walk | how full | note):
${spots.map((s) => `${s.building.id} | ${s.building.name} | ${s.walk} min | ${s.fill}% full, ${hotspotLabel(s.hotspot)} | ${s.building.studySpot!.note}`).join("\n")}

What should ${me.name.split(" ")[0]} do right now? Give exactly 3 options, best first.`;

  const fallback = (): NowPlanT => {
    const top = ranked.slice(0, 2);
    const spot = spots[0];
    return {
      headline: next ? `You have ${fw.minutes} minutes before ${next.code}.` : "Nothing else on your schedule today.",
      suggestions: [
        ...top.map((c) => ({
          eventId: c.id, buildingId: c.buildingId as NowPlanT["suggestions"][number]["buildingId"], title: c.title,
          why: [c.live ? "Happening now" : `Starts in ${c.startsInMin} min`, `${c.walkMin} min walk`, c.friendsGoing.length ? `${c.friendsGoing[0].name.split(" ")[0]} is going` : null, c.freeFood ? c.foodDetail : null].filter(Boolean).join(" · "),
          action: (c.category === "academic" ? "study" : c.freeFood ? "eat" : "join") as NowPlanT["suggestions"][number]["action"],
        })),
        ...(spot ? [{ eventId: null, buildingId: spot.building.id as NowPlanT["suggestions"][number]["buildingId"], title: `Study at ${spot.building.name}`, why: `${spot.fill}% full right now · ${spot.walk} min walk · ${spot.building.studySpot!.note}`, action: "study" as const }] : []),
      ].slice(0, 3),
      headsUp: deadlines[0]?.title ?? (next ? `Leave by ${fmt(new Date(+next.start - (walkToNext + 3) * 60_000))} to make ${next.code}.` : null),
    };
  };

  const res = await planNow({ prompt, fallback });
  // drop hallucinated ids
  const ids = new Set(ranked.map((r) => r.id));
  res.data.suggestions = res.data.suggestions.map((s) => (s.eventId && !ids.has(s.eventId) ? { ...s, eventId: null } : s));
  return Response.json({
    plan: res.data, ai: res.ai, error: res.error,
    freeMinutes: fw.minutes,
    nextClass: next ? { code: next.code, room: next.room, start: next.start.toISOString(), walk: walkToNext } : null,
    leaveBy: next ? new Date(+next.start - (walkToNext + 3) * 60_000).toISOString() : null,
  });
}
