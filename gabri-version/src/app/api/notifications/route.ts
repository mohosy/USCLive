import { z } from "zod";
import { body } from "@/lib/http";
import { remindSignups, tickLive } from "@/lib/live";
import { db } from "@/lib/store";


export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get("live") !== "0") { tickLive(); remindSignups(); }
  // `since`: only what's newer than the client's latest, so the 8s poll is usually empty
  const since = new URL(req.url).searchParams.get("since");
  const n = db().notifications;
  const list = since ? n.filter((x) => x.createdAt > since) : n;
  return Response.json({ notifications: list.slice(0, 60), unread: n.filter((x) => !x.read).length });
}

export async function POST(req: Request) {
  const parsed = await body(req, z.object({ ids: z.array(z.string()).optional(), all: z.boolean().optional() }));
  if (!parsed.ok) return parsed.res;
  for (const n of db().notifications) if (parsed.data.all || parsed.data.ids?.includes(n.id)) n.read = true;
  return Response.json({ ok: true });
}
