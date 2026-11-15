import { importCalendarItems } from "@/lib/calendarImport";
import { fetchCalendarItems, getSession } from "@/lib/google";
import { withState } from "@/lib/state";

/** Live sync: pull the next two weeks from Google Calendar and replace what was there (moved/deleted entries update too). */
async function POST_(req: Request) {
  if (!getSession()) return Response.json({ error: "Google isn't connected." }, { status: 401 });
  const first = new URL(req.url).searchParams.get("first") === "1";
  try {
    const items = await fetchCalendarItems();
    return Response.json({ ...importCalendarItems(items, "calendar", { replace: true, notify: first }), lastSync: new Date().toISOString() });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}

export const POST = withState(POST_);
