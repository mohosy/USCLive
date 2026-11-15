import { z } from "zod";
import { body } from "@/lib/http";
import { canSee, db, getMe, getUser, publicEvent } from "@/lib/store";
import { withState } from "@/lib/state";

async function POST_(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = await body(req, z.object({ userIds: z.array(z.string()).min(1).max(50) }));
  if (!parsed.ok) return parsed.res;
  const me = getMe();
  const ev = db().events.find((e) => e.id === id);
  if (!ev || !canSee(ev, me)) return Response.json({ error: "Not found" }, { status: 404 });
  // anyone who can see an event can send it to friends; invite-only events: host only
  if (ev.visibility === "invite" && ev.host.id !== me.id) return Response.json({ error: "Only the host can invite to this event" }, { status: 403 });
  const valid = parsed.data.userIds.filter((u) => getUser(u) && me.friends.includes(u));
  ev.invitees = Array.from(new Set([...ev.invitees, ...valid]));
  return Response.json({ invited: valid.length, event: publicEvent(ev, me) });
}

export const POST = withState(POST_);
