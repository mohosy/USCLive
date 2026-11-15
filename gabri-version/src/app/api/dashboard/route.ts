import { orgStats } from "@/lib/dashboard";
import { orgs } from "@/lib/store";
import { withState } from "@/lib/state";


async function GET_(req: Request) {
  const orgId = new URL(req.url).searchParams.get("org") ?? "org_usg";
  const stats = orgStats(orgId);
  if (!stats) return Response.json({ error: "Unknown org" }, { status: 404 });
  return Response.json({ ...stats, orgs: orgs() });
}

export const GET = withState(GET_);
