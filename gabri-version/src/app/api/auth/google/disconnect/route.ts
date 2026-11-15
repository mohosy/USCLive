import { disconnect } from "@/lib/google";
import { db, getMe } from "@/lib/store";

/** Forget the Google account (revokes access) and remove its calendar entries from the map. */
export async function POST() {
  disconnect();
  const me = getMe();
  const d = db();
  d.events = d.events.filter((e) => !(e.source === "calendar" && e.tags.includes("imported") && e.invitees.includes(me.id)));
  return Response.json({ ok: true });
}
