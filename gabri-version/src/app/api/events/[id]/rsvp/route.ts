import { cancel, findRegistration, register, registrationSite } from "@/lib/registration";
import { addNotification, canSee, db, getMe, newId, publicEvent } from "@/lib/store";
import { withState } from "@/lib/state";

async function POST_(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const me = getMe();
  const ev = db().events.find((e) => e.id === id);
  if (!ev || !canSee(ev, me)) return Response.json({ error: "Not found" }, { status: 404 });
  // events that take registrations follow the registration rules (capacity, waitlist, deadline), not this plain toggle
  if (ev.registrationType) {
    if (ev.registrationType !== "native") return Response.json({ error: `Registration for this event happens on ${registrationSite(ev.registrationType)}.` }, { status: 400 });
    const regs = db().registrations, mine = findRegistration(regs, ev.id, me.id);
    const r = mine && mine.status !== "cancelled" ? cancel(ev, me.id, regs, Date.now(), () => newId("reg")) : register(ev, me.id, regs, Date.now(), () => newId("reg"));
    if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
    return Response.json({ event: publicEvent(ev, me) });
  }
  const i = ev.attendees.indexOf(me.id);
  if (i >= 0) ev.attendees.splice(i, 1);
  else {
    if (ev.capacity && ev.attendees.length >= ev.capacity) return Response.json({ error: "This one is full" }, { status: 409 });
    ev.attendees.push(me.id);
    if (ev.host.kind === "user" && ev.host.id && ev.host.id !== me.id)
      addNotification({ userId: me.id, kind: "system", title: `You're in: ${ev.title}`, body: `${ev.host.name} will see you're coming`, eventId: ev.id, source: "live" });
  }
  return Response.json({ event: publicEvent(ev, me) });
}

export const POST = withState(POST_);
