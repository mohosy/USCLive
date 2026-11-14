import { z } from "zod";
import { body } from "@/lib/http";
import { tickLive } from "@/lib/live";
import { db } from "@/lib/store";


export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get("live") !== "0") tickLive();
  const n = db().notifications;
  return Response.json({ notifications: n.slice(0, 60), unread: n.filter((x) => !x.read).length });
}

export async function POST(req: Request) {
  const parsed = await body(req, z.object({ ids: z.array(z.string()).optional(), all: z.boolean().optional() }));
  if (!parsed.ok) return parsed.res;
  for (const n of db().notifications) if (parsed.data.all || parsed.data.ids?.includes(n.id)) n.read = true;
  return Response.json({ ok: true });
}
