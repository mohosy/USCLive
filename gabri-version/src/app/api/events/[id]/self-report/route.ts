import { z } from "zod";
import { selfReport } from "@/lib/registration";
import { guard, readBody, respond } from "@/lib/registrationApi";
import { withState } from "@/lib/state";
import { db, newId } from "@/lib/store";

/**
 * Handshake / Engage / external events: the student registered on the official page and confirms it here.
 * This only records what they told us ("self-reported"). USCLive never registers anyone on those sites.
 */
async function POST_(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard(req, ctx, "write");
  if (!g.ok) return g.res;
  const b = await readBody(req, z.object({ confirmed: z.literal(true) }).strict(), true);
  if (!b.ok) return b.res;
  return respond(g.ev, g.me, selfReport(g.ev, g.me.id, db().registrations, Date.now(), () => newId("reg")));
}

export const POST = withState(POST_);
