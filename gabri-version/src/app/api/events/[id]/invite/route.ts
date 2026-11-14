import { z } from "zod";
import { body } from "@/lib/http";
import { db, getMe, getUser, publicEvent } from "@/lib/store";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = await body(req, z.object({ userIds: z.array(z.string()).min(1).max(50) }));
  if (!parsed.ok) return parsed.res;
  const me = getMe();
  const ev = db().events.find((e) => e.id === id);
  if (!ev) return Response.json({ error: "Not found" }, { status: 404 });
  // anyone going (or the host) can invite friends; invite-only events: host only
  const allowed = ev.host.id === me.id || (ev.visibility !== "invite" && ev.attendees.includes(me.id));
  if (!allowed) return Response.json({ error: "Only the host can invite to this event" }, { status: 403 });
  const valid = parsed.data.userIds.filter((u) => getUser(u) && me.friends.includes(u));
  ev.invitees = Array.from(new Set([...ev.invitees, ...valid]));
  return Response.json({ invited: valid.length, event: publicEvent(ev, me) });
}
