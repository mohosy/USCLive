import { addNotification, db, getMe } from "@/lib/store";
import { withState } from "@/lib/state";

/** Cancel an event you host: it leaves the map, and everyone who was going or invited is told. */
async function DELETE_(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const d = db();
  const me = getMe();
  const ev = d.events.find((e) => e.id === id);
  if (!ev) return Response.json({ error: "Not found" }, { status: 404 });
  const mine = ev.host.id === me.id || (ev.host.kind === "org" && !!ev.host.id && me.creatorOrgId === ev.host.id);
  if (!mine) return Response.json({ error: "Only the host can cancel this event." }, { status: 403 });
  d.events = d.events.filter((e) => e.id !== id);
  const told = new Set([...ev.attendees, ...(ev.invitees ?? [])].filter((u) => u !== me.id && !u.startsWith("anon")));
  for (const uid of told) addNotification({ kind: "system", title: "Event cancelled", body: `${ev.title} was cancelled by ${ev.host.name}.`, source: "live", userId: uid });
  return Response.json({ ok: true });
}

export const DELETE = withState(DELETE_);
