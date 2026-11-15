import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { resetDb } from "@/lib/store";
import { persisted, runWithState, withState } from "@/lib/state";

/**
 * Re-seed demo data relative to the current time (handy right before recording the demo).
 * On a deployment with a database this replaces shared data for everyone, so it needs the staff key
 * (x-staff-key = DPS_STAFF_KEY, server-side only); without a key set, nobody can reset it. A local server
 * with no database only holds its own memory copy, so there it stays open.
 */
async function POST_(req: Request) {
  if (persisted()) {
    const key = process.env.DPS_STAFF_KEY ?? "";
    const given = req.headers.get("x-staff-key") ?? "";
    const ok = key.length > 0 && given.length === key.length && timingSafeEqual(Buffer.from(given), Buffer.from(key));
    if (!ok) return Response.json({ error: "Only staff can reset the shared data." }, { status: 403 });
  }
  resetDb();
  after(() => runWithState(() => import("@/lib/store").then((s) => s.syncDps(true))));
  return Response.json({ ok: true });
}

export const POST = withState(POST_);
