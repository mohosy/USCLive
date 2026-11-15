import { z } from "zod";
import { body } from "@/lib/http";
import { getMe, getUser, setFriends } from "@/lib/store";

const Input = z.object({ userId: z.string().max(40) });

async function change(req: Request, on: boolean) {
  const b = await body(req, Input);
  if (!b.ok) return b.res;
  const me = getMe();
  const other = getUser(b.data.userId);
  if (!other || other.id === me.id || other.id.startsWith("anon")) return Response.json({ error: "No one with that account." }, { status: 404 });
  setFriends(me, other, on);
  // the browser keeps this list so friends survive a demo-server restart
  return Response.json({ friendIds: me.friends });
}

/** Add a friend (demo: accepted right away, both ways). */
export const POST = (req: Request) => change(req, true);
/** Remove a friend. */
export const DELETE = (req: Request) => change(req, false);
