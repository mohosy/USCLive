import { z } from "zod";
import { DINING_HALLS, HALL_IDS, demoMenu, laDate } from "@/lib/dining";
import type { DiningPayload, HallId } from "@/lib/dining";
import { getDining } from "@/lib/diningProvider";

const DAY = 86_400_000;
const dayNumber = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d) / DAY; };

const query = z.object({
  hall: z.enum(["evk", "parkside", "village"], { error: "Pick a hall: evk, parkside or village." }).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Write the date like 2026-11-14." })
    .refine((s) => new Date(dayNumber(s) * DAY).toISOString().slice(0, 10) === s, { error: "That date does not exist." }).optional(),
});

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const parsed = query.safeParse({ hall: sp.get("hall") || undefined, date: sp.get("date") || undefined });
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Bad request." }, { status: 400, headers: { "Cache-Control": "no-store" } });

  const today = laDate(Date.now());
  const date = parsed.data.date ?? today;
  const diff = dayNumber(date) - dayNumber(today);
  if (diff < -1 || diff > 7) return Response.json({ error: "Pick a day from yesterday to a week from now." }, { status: 400, headers: { "Cache-Control": "no-store" } });

  const halls: HallId[] = parsed.data.hall ? [parsed.data.hall] : HALL_IDS;
  try {
    return Response.json(await getDining(date, halls), { headers: { "Cache-Control": "no-store" } });
  } catch {
    // the provider should never throw; if it does, still answer with the demo menus
    const payload: DiningPayload = {
      date,
      halls: halls.map((h) => {
        const i = DINING_HALLS[h];
        const meals = demoMenu(h, date);
        return {
          hall: h, name: i.name, short: i.short, buildingId: i.buildingId, lat: i.lat, lng: i.lng, date, meals,
          currentMeal: meals[0]?.id ?? null,
          hours: { open: null, close: null, openNow: false, label: "Hours unavailable", source: "usual" as const },
          source: "demo" as const, sourceLabel: "Demo menu", fetchedAt: new Date().toISOString(),
        };
      }),
      notes: ["Menus could not be loaded, showing demo menus"],
    };
    return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
  }
}
