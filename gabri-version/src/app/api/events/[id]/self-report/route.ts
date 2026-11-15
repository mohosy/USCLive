import { z } from "zod";
import { selfReport } from "@/lib/registration";
import { conflictStop, guard, readBody, respond } from "@/lib/registrationApi";
import { withState } from "@/lib/state";
import { db, newId } from "@/lib/store";

/**
 * Handshake / Engage / external events: the student registered on the official page and confirms it here.
 * This only records what they told us ("self-reported"). USCLive never registers anyone on those sites.
 */
async function POST_(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard(req, ctx, "write");
  if (!g.ok) return g.res;
  const b = await readBody(req, z.object({ confirmed: z.literal(true), anyway: z.literal(true).optional() }).strict(), true);
  if (!b.ok) return b.res;
  // the same schedule check as a registration here: it goes on your schedule, so a clash is worth knowing about
  if (g.ev.registrationType && g.ev.registrationType !== "native") {
    const stop = conflictStop(g.ev, g.me, !!b.data?.anyway);
    if (stop) return stop;
  }
  return respond(g.ev, g.me, selfReport(g.ev, g.me.id, db().registrations, Date.now(), () => newId("reg")));
}

export const POST = withState(POST_);
