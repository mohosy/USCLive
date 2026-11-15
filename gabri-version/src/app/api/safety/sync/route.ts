import { activeAlerts, syncDps } from "@/lib/store";
import { withState } from "@/lib/state";

/** Force a refresh from the DPS Daily Crime Log. */
async function POST_() {
  const status = await syncDps(true);
  return Response.json({ ...status, active: activeAlerts().filter((a) => a.source === "dps_log").length });
}

export const POST = withState(POST_);
