import { z } from "zod";
import { body } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";
import { sessionUser } from "@/lib/registrationApi";
import { addNotification, db } from "@/lib/store";
import { withState } from "@/lib/state";

/**
 * USG / staff reviewer decision on a flagged event. Needs a signed-in account (the organizer dashboard is the only
 * caller) and is rate limited; a real deployment would also check for a USG reviewer role.
 */
async function POST_(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = sessionUser(req);
  if (!me) return Response.json({ error: "Sign in to review events." }, { status: 401 });
  const rl = rateLimit(`moderation:${me.id}`, 20, 60_000);
  if (!rl.ok) return Response.json({ error: `Too many requests. Try again in ${rl.retryAfterS} seconds.` }, { status: 429, headers: { "Retry-After": String(rl.retryAfterS) } });
  const { id } = await ctx.params;
  const parsed = await body(req, z.object({ action: z.enum(["approve", "reject"]) }));
  if (!parsed.ok) return parsed.res;
  const ev = db().events.find((e) => e.id === id);
  if (!ev) return Response.json({ error: "Not found" }, { status: 404 });
  ev.moderation = { ...ev.moderation, status: parsed.data.action === "approve" ? "approved" : "rejected" };
  if (parsed.data.action === "approve") addNotification({ kind: "event", title: `New on the map: ${ev.title}`, body: "Approved by USG reviewer", eventId: ev.id, source: "live" });
  return Response.json({ ok: true, moderation: ev.moderation });
}

export const POST = withState(POST_);
