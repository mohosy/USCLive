import { z } from "zod";
import { body } from "@/lib/http";
import { remindSignups, tickLive } from "@/lib/live";
import { markRead, myNotifications } from "@/lib/store";
import { withState } from "@/lib/state";


async function GET_(req: Request) {
  if (new URL(req.url).searchParams.get("live") !== "0") { tickLive(); remindSignups(); }
  // `since`: only what's newer than the client's latest, so the 8s poll is usually empty
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
