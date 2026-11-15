import { connection } from "next/server";
import { getSession, googleConfigured } from "@/lib/google";

/** Is Google sign-in set up, and is a Google account connected? (No tokens ever leave the server.) */
export async function GET() {
  await connection();
  const s = getSession();
  return Response.json({
    configured: googleConfigured(),
    connected: !!s,
    profile: s ? { email: s.email, firstName: s.firstName, lastName: s.lastName } : null,
    lastSync: s?.lastSync ?? null,
  });
}
