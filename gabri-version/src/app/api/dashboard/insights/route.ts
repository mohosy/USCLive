import { z } from "zod";
import { orgInsights, type InsightsT } from "@/lib/ai";
import { orgStats } from "@/lib/dashboard";
import { body } from "@/lib/http";

export async function POST(req: Request) {
  const parsed = await body(req, z.object({ orgId: z.string() }));
  if (!parsed.ok) return parsed.res;
  const s = orgStats(parsed.data.orgId);
  if (!s) return Response.json({ error: "Unknown org" }, { status: 404 });
  const fmt = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
  const text = `Organization: ${s.org.name} (${s.org.kind}, ${s.org.members} members)
Totals: ${JSON.stringify(s.totals)}
Events (title | when | where | RSVPs | expected | measured turnout | show rate | free food | status):
${s.rows.slice(0, 40).map((r) => `${r.title} | ${fmt(r.start)} | ${r.building} | ${r.rsvps} | ${r.expected ?? "-"} | ${r.measured ?? "-"} | ${r.showRate ?? "-"}% | ${r.freeFood ? "yes" : "no"} | ${r.status}`).join("\n")}
RSVPs by category: ${s.byCategory.map((c) => `${c.category} ${c.rsvps}`).join(", ")}
Moderation queue: ${s.queue.length} item(s).`;

  const fallback = (): InsightsT => {
    const best = [...s.rows].filter((r) => r.showRate != null).sort((a, b) => (b.showRate ?? 0) - (a.showRate ?? 0))[0];
    const food = s.rows.filter((r) => r.freeFood);
    const foodAvg = food.length ? Math.round(food.reduce((a, r) => a + r.rsvps, 0) / food.length) : 0;
    const noFood = s.rows.filter((r) => !r.freeFood);
    const noFoodAvg = noFood.length ? Math.round(noFood.reduce((a, r) => a + r.rsvps, 0) / noFood.length) : 0;
    return {
      summary: `${s.totals.events} events, ${s.totals.rsvps} RSVPs${s.totals.avgShowRate != null ? `, ${s.totals.avgShowRate}% average show rate` : ""}.`,
      bullets: [
        best ? `Best turnout: ${best.title} (${best.showRate}% of RSVPs showed up).` : "No completed events with measured turnout yet.",
        `Events with free food average ${foodAvg} RSVPs vs ${noFoodAvg} without.`,
        `Top category by RSVPs: ${s.byCategory[0]?.category ?? "n/a"}.`,
        s.queue.length ? `${s.queue.length} user-submitted event(s) waiting for review.` : "Moderation queue is clear.",
      ],
      recommendation: foodAvg > noFoodAvg ? "Advertise food in the title — it measurably lifts RSVPs." : "Schedule in the late afternoon when nearby buildings are already busy.",
    };
  };
  const res = await orgInsights(text, fallback);
  return Response.json({ insights: res.data, ai: res.ai, error: res.error });
}
