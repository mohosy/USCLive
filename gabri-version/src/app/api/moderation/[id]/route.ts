import { z } from "zod";
import { body } from "@/lib/http";
import { addNotification, db } from "@/lib/store";

/** USG / staff reviewer decision on a flagged event. (Demo: no auth; production: USG role check.) */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = await body(req, z.object({ action: z.enum(["approve", "reject"]) }));
  if (!parsed.ok) return parsed.res;
  const ev = db().events.find((e) => e.id === id);
  if (!ev) return Response.json({ error: "Not found" }, { status: 404 });
  ev.moderation = { ...ev.moderation, status: parsed.data.action === "approve" ? "approved" : "rejected" };
  if (parsed.data.action === "approve") addNotification({ kind: "event", title: `New on the map: ${ev.title}`, body: "Approved by USG reviewer", eventId: ev.id, source: "live" });
  return Response.json({ ok: true, moderation: ev.moderation });
}
