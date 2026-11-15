import { connection } from "next/server";
import { finishSignIn } from "@/lib/google";

/** Google sends people back here. Check the state (stops forged sign-ins), store tokens, return to the map. */
export async function GET(req: Request) {
  await connection();
  const u = new URL(req.url);
  const cookieState = req.headers.get("cookie")?.match(/(?:^|;\s*)g_state=([^;]+)/)?.[1];
  const back = (q: string) => new Response(null, { status: 302, headers: { Location: `/?${q}`, "Set-Cookie": "g_state=; Path=/api/auth/google; Max-Age=0" } });
  if (u.searchParams.get("error")) return back("google=cancelled");
  const code = u.searchParams.get("code");
  if (!code || !cookieState || cookieState !== u.searchParams.get("state")) return back("google=error&reason=state");
  try {
    await finishSignIn(req, code);
    return back("google=connected");
  } catch (e) {
    return back(`google=error&reason=${encodeURIComponent((e as Error).message.slice(0, 120))}`);
  }
}
