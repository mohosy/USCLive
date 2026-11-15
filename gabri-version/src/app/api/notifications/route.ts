import { z } from "zod";
import { body } from "@/lib/http";
import { remindSignups, remindStarting, tickLive } from "@/lib/live";
import { markRead, myNotifications, settleFriendRequests } from "@/lib/store";
import { withState } from "@/lib/state";

const Here = z.object({ lat: z.coerce.number().min(-90).max(90).optional(), lng: z.coerce.number().min(-180).max(180).optional() });

async function GET_(req: Request) {
  if (new URL(req.url).searchParams.get("live") !== "0") { tickLive(); remindSignups(); }
  // where the student is (optional, sent by the app): only used to say how long the walk to a registered event is
  const sp = new URL(req.url).searchParams;
  const here = Here.safeParse({ lat: sp.get("lat") ?? undefined, lng: sp.get("lng") ?? undefined });
  remindStarting(here.success && here.data.lat != null && here.data.lng != null ? { lat: here.data.lat, lng: here.data.lng } : undefined);
  // `since`: only what's newer than the client's latest, so the 8s poll is usually empty
  settleFriendRequests();
  const since = new URL(req.url).searchParams.get("since");
  const n = myNotifications();
  const list = since ? n.filter((x) => x.createdAt > since) : n;
  return Response.json({ notifications: list.slice(0, 60), unread: n.filter((x) => !x.read).length });
}

async function POST_(req: Request) {
  const parsed = await body(req, z.object({ ids: z.array(z.string()).optional(), all: z.boolean().optional() }));
  if (!parsed.ok) return parsed.res;
  markRead(parsed.data.all ? "all" : parsed.data.ids ?? []);
  return Response.json({ ok: true });
}

export const GET = withState(GET_);

export const POST = withState(POST_);
