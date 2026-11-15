import { z } from "zod";
import { cancel, register } from "@/lib/registration";
import { conflictStop, guard, readBody, respond, SignUpBody } from "@/lib/registrationApi";
import { withState } from "@/lib/state";
import { db, newId } from "@/lib/store";

type Ctx = { params: Promise<{ id: string }> };
const Empty = z.object({}).strict(); // nothing to send: who you are comes from your session

/**
 * Register for a native event: instantly if there is room, otherwise onto the waitlist. Asking twice changes nothing.
 * If it clashes with your classes or another event you are going to, nothing is saved and the conflicts come back
 * (409, code "conflict"); sending { anyway: true } registers you regardless.
 */
async function POST_(req: Request, ctx: Ctx) {
  const g = await guard(req, ctx, "write");
  if (!g.ok) return g.res;
  const b = await readBody(req, SignUpBody, false);
  if (!b.ok) return b.res;
  if (g.ev.registrationType === "native") {
    const stop = conflictStop(g.ev, g.me, !!b.data?.anyway);
    if (stop) return stop;
  }
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
