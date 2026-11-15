import { connection } from "next/server";
import { getSession, googleConfigured } from "@/lib/google";
import { getMe } from "@/lib/store";
import { withState } from "@/lib/state";

/** Is Google sign-in set up, and is a Google account connected? (No tokens ever leave the server.) */
async function GET_() {
  await connection();
  const s = getSession();
  return Response.json({
    configured: googleConfigured(),
    connected: !!s,
    profile: s ? { email: s.email, firstName: s.firstName, lastName: s.lastName } : null,
    /** this Google account already finished sign-up (school + username), so it can go straight to the map */
    registered: !!s && !!getMe().username && getMe().school !== "all",
    lastSync: s?.lastSync ?? null,
  });
}

export const GET = withState(GET_);
