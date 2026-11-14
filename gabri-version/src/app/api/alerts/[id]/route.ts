import { db } from "@/lib/store";

/** DPS / USG marks an alert as resolved, which takes it off the map. (Demo: no auth; production: DPS role.) */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const a = db().alerts.find((x) => x.id === id);
  if (!a) return Response.json({ error: "Not found" }, { status: 404 });
  a.resolved = true;
  return Response.json({ ok: true });
}
