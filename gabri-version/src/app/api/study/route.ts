import { hotspotLabel, studySpots } from "@/lib/planner";
import { withState } from "@/lib/state";

async function GET_(req: Request) {
  const sp = new URL(req.url).searchParams;
  const lat = Number(sp.get("lat") ?? 34.0208);
  const lng = Number(sp.get("lng") ?? -118.2851);
  const spots = studySpots({ lat, lng, label: "me" }).map((s) => ({
    building: s.building, walk: s.walk, fill: s.fill, level: s.hotspot.level, trend: s.hotspot.trend,
    ratio: s.hotspot.ratio, label: hotspotLabel(s.hotspot), count: s.hotspot.suppressed ? null : s.hotspot.count,
  }));
  return Response.json({ spots });
}

export const GET = withState(GET_);
