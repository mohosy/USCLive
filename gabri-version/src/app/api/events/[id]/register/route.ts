import { z } from "zod";
import { cancel, register } from "@/lib/registration";
import { guard, readBody, respond } from "@/lib/registrationApi";
import { withState } from "@/lib/state";
import { db, newId } from "@/lib/store";

type Ctx = { params: Promise<{ id: string }> };
const Empty = z.object({}).strict(); // nothing to send: who you are comes from your session

/** Register for a native event: instantly if there is room, otherwise onto the waitlist. Asking twice changes nothing. */
async function POST_(req: Request, ctx: Ctx) {
  const g = await guard(req, ctx, "write");
  if (!g.ok) return g.res;
  const b = await readBody(req, Empty, false);
  if (!b.ok) return b.res;
  return respond(g.ev, g.me, register(g.ev, g.me.id, db().registrations, Date.now(), () => newId("reg")));
}

/** Cancel your registration (or leave the waitlist, or take back "I registered"). The first person waiting moves up. */
async function DELETE_(req: Request, ctx: Ctx) {
  const g = await guard(req, ctx, "write");
  if (!g.ok) return g.res;
  const b = await readBody(req, Empty, false);
  if (!b.ok) return b.res;
  return respond(g.ev, g.me, cancel(g.ev, g.me.id, db().registrations, Date.now(), () => newId("reg")));
}

export const POST = withState(POST_);
export const DELETE = withState(DELETE_);
