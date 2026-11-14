import { resetDb } from "@/lib/store";

/** Re-seed demo data relative to the current time (handy right before recording the demo). */
export async function POST() {
  resetDb();
  return Response.json({ ok: true });
}
