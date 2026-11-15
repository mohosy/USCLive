import { disconnect } from "@/lib/google";
import { db, getMe } from "@/lib/store";
import { withState } from "@/lib/state";

/** Forget the Google account (revokes access) and remove its calendar entries from the map. */
async function POST_() {
  disconnect();
  const me = getMe();
  const d = db();
  d.events = d.events.filter((e) => !(e.source === "calendar" && e.tags.includes("imported") && e.invitees.includes(me.id)));
  return Response.json({ ok: true });
}

export const POST = withState(POST_);
