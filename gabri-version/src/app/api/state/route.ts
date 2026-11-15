import { after, connection } from "next/server";
import { runWithState } from "@/lib/state";
import { aiEnabled } from "@/lib/ai";
import { computeHotspots } from "@/lib/hotspots";
import { freeWindow, todaysClasses } from "@/lib/planner";
import { photoVersion } from "@/lib/account";
import { activeAlerts, canSee, db, getMe, getUser, myNotifications, orgs, publicEvent, syncDps } from "@/lib/store";
import { withState } from "@/lib/state";


async function GET_() {
  await connection();
  // refresh the DPS crime log after responding (every 30 min); runs in its own saved state, so serverless hosts don't cut it off
  if (Date.now() - db().dps.lastSync > 30 * 60_000) after(() => runWithState(() => syncDps()));
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
      // the photo is served once as an image (cacheable), not re-sent inside every refresh
      photo: me.photo ? `/api/profile/photo?v=${photoVersion(me.photo)}` : undefined,
      friends: me.friends.map((id) => {
        const u = getUser(id)!;
        return { id, name: u.name, avatar: u.avatar, school: u.school, username: u.username ?? "", photo: u.photo?.startsWith("/") ? u.photo : undefined };
      }),
      today: todaysClasses(me, now).map((c) => ({ ...c, start: c.start.toISOString(), end: c.end.toISOString() })),
      freeMinutes: fw.minutes,
      freeUntil: fw.until?.toISOString() ?? null,
    },
    events,
    hotspots: computeHotspots(d.events, now),
    alerts: activeAlerts(now),
    orgs: orgs(),
    unread: myNotifications().filter((n) => !n.read).length,
  });
}

export const GET = withState(GET_);
