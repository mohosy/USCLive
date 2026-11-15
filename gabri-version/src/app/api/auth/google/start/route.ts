import { randomUUID } from "node:crypto";
import { connection } from "next/server";
import { authUrl, googleConfigured } from "@/lib/google";
import { withState } from "@/lib/state";

/** Send the browser to Google's sign-in, with a one-time state value to check on the way back. */
async function GET_(req: Request) {
  await connection();
  if (!googleConfigured()) return new Response("Google sign-in isn't set up: add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local.", { status: 503 });
  const state = randomUUID();
  return new Response(null, {
    status: 302,
    headers: { Location: authUrl(req, state), "Set-Cookie": `g_state=${state}; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=600` },
  });
}

export const GET = withState(GET_);
