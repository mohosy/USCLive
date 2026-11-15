import { connection } from "next/server";
import { BUILDING_BY_ID } from "@/lib/campus";
import { computeHotspots, dayCurve, hotspotFor } from "@/lib/hotspots";
import { canSee, db, getMe, publicEvent } from "@/lib/store";
import { withState } from "@/lib/state";


async function GET_(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await ctx.params;
  const b = BUILDING_BY_ID[id];
  if (!b) return Response.json({ error: "Not found" }, { status: 404 });
  const me = getMe();
  const now = new Date();
  return Response.json({
    building: b,
    // the main buildings' tracked numbers; every other building gets the same math on demand
    hotspot: computeHotspots(db().events, now).find((h) => h.buildingId === id) ?? hotspotFor(b, db().events, now),
    curve: dayCurve(b, db().events, now),
    events: db().events.filter((e) => e.buildingId === id && canSee(e, me) && +new Date(e.end) > +now).map((e) => publicEvent(e, me)),
  });
}

export const GET = withState(GET_);
