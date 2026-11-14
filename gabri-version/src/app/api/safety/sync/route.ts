import { activeAlerts, syncDps } from "@/lib/store";

/** Force a refresh from the DPS Daily Crime Log. */
export async function POST() {
  const status = await syncDps(true);
  return Response.json({ ...status, active: activeAlerts().filter((a) => a.source === "dps_log").length });
}
