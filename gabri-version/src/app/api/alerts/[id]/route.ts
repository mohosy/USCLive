import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/store";

/**
 * DPS staff mark an alert as resolved, which takes it off the map. Students can't: the request needs the
 * staff key (DPS_STAFF_KEY, server-side only). Without one set, nobody can clear alerts; they expire on their own.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const key = process.env.DPS_STAFF_KEY ?? "";
  const given = req.headers.get("x-staff-key") ?? "";
  const ok = key.length > 0 && given.length === key.length && timingSafeEqual(Buffer.from(given), Buffer.from(key));
  if (!ok) return Response.json({ error: "Only DPS staff can clear alerts" }, { status: 403 });
  const { id } = await ctx.params;
  const a = db().alerts.find((x) => x.id === id);
  if (!a) return Response.json({ error: "Not found" }, { status: 404 });
  a.resolved = true;
  return Response.json({ ok: true });
}
