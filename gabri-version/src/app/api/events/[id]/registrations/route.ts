import { z } from "zod";
import { backfill, canManage, counts, rows, toCsv } from "@/lib/registration";
import { guard } from "@/lib/registrationApi";
import { withState } from "@/lib/state";
import { db, getUser, newId } from "@/lib/store";

const Query = z.object({ format: z.enum(["json", "csv"]).default("json") });

/** Organizer only: who registered, with counts. `?format=csv` downloads the same list as a spreadsheet file. */
async function GET_(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard(req, ctx, "read");
  if (!g.ok) return g.res;
  const q = Query.safeParse({ format: new URL(req.url).searchParams.get("format") ?? undefined });
  if (!q.success) return Response.json({ error: "format must be json or csv" }, { status: 400 });
  if (!g.ev.registrationType) return Response.json({ error: "This event doesn't take registrations." }, { status: 400 });
  if (!canManage(g.ev, g.me)) return Response.json({ error: "Only this event's organizer can see its registrations." }, { status: 403 });
  const regs = db().registrations;
  backfill(g.ev, regs, () => newId("reg"));
  const list = rows(g.ev, regs, getUser);
  if (q.data.format === "csv") {
    const name = g.ev.title.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "event";
    return new Response(toCsv(list), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="registrations-${name}.csv"`, "Cache-Control": "no-store" } });
  }
  return Response.json({
    event: { id: g.ev.id, title: g.ev.title, type: g.ev.registrationType, capacity: g.ev.capacity ?? null, deadline: g.ev.registrationDeadline ?? null },
    counts: counts(g.ev, regs),
    registrations: list,
  });
}

export const GET = withState(GET_);
