import { orgStats } from "@/lib/dashboard";
import { orgs } from "@/lib/store";


export async function GET(req: Request) {
  const orgId = new URL(req.url).searchParams.get("org") ?? "org_usg";
  const stats = orgStats(orgId);
  if (!stats) return Response.json({ error: "Unknown org" }, { status: 404 });
  return Response.json({ ...stats, orgs: orgs() });
}
