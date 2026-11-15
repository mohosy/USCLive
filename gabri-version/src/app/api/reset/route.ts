import { after } from "next/server";
import { resetDb } from "@/lib/store";
import { runWithState, withState } from "@/lib/state";

/** Re-seed demo data relative to the current time (handy right before recording the demo). */
async function POST_() {
  resetDb();
  after(() => runWithState(() => import("@/lib/store").then((s) => s.syncDps(true))));
  return Response.json({ ok: true });
}

export const POST = withState(POST_);
