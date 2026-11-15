import { demoGames, getScores } from "@/lib/scoresProvider";

// Public: no sign-in and no app state. Never answers with an error: if anything breaks, it returns the demo games.
export async function GET(req: Request) {
  void req.url;
  try {
    return Response.json(await getScores(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const now = Date.now();
    return Response.json(
      { games: demoGames(now), upcoming: [], fetchedAt: new Date(now).toISOString(), notes: [`scores unavailable: ${e instanceof Error ? e.message : "error"}`] },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
