import { connection } from "next/server";
import { aiEnabled } from "@/lib/ai";
import { BUILDINGS } from "@/lib/campus";
import { computeHotspots } from "@/lib/hotspots";
import { freeWindow, todaysClasses } from "@/lib/planner";
import { activeAlerts, canSee, db, getMe, getUser, orgs, publicEvent, syncDps } from "@/lib/store";


export async function GET() {
  await connection();
  void syncDps(); // background refresh of the DPS crime log (throttled to every 30 min)
  const me = getMe();
  const now = new Date();
  const d = db();
  const events = d.events
    .filter((e) => canSee(e, me))
    .filter((e) => +new Date(e.end) > +now - 60 * 60_000) // keep things that ended < 1h ago out of the way
    .map((e) => publicEvent(e, me));
  const fw = freeWindow(me, now);
  return Response.json({
    now: now.toISOString(),
    aiEnabled: aiEnabled(),
    me: {
      ...me,
      friends: me.friends.map((id) => {
        const u = getUser(id)!;
        return { id, name: u.name, avatar: u.avatar, school: u.school };
      }),
      today: todaysClasses(me, now).map((c) => ({ ...c, start: c.start.toISOString(), end: c.end.toISOString() })),
      freeMinutes: fw.minutes,
      freeUntil: fw.until?.toISOString() ?? null,
    },
    events,
    hotspots: computeHotspots(d.events, now),
    alerts: activeAlerts(now),
    buildings: BUILDINGS,
    orgs: orgs(),
    unread: d.notifications.filter((n) => !n.read).length,
  });
}
