import { z } from "zod";
import { matchBuilding } from "@/lib/campus";
import { parseEventPage } from "@/lib/eventImport";
import { body, safeExternalUrl } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";
import { sessionUser } from "@/lib/registrationApi";
import { withState } from "@/lib/state";

/** Only the two official platforms: Handshake (any *.joinhandshake.com) and USC's Engage (Campus Labs). */
const ALLOWED = /(^|\.)joinhandshake\.com$|^engage\.usc\.edu$|(^|\.)campuslabs\.com$/;
const MAX_BYTES = 1_500_000;

/** Fetch one public page. Every redirect is checked against the same allowed hosts, so it can never be steered elsewhere. */
async function fetchPublicPage(start: URL): Promise<string> {
  let u = start;
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(u, { headers: { "User-Agent": "USCLive/0.1 (student hackathon project)", Accept: "text/html" }, redirect: "manual", signal: AbortSignal.timeout(10_000) });
    if (res.status >= 300 && res.status < 400) {
      void res.body?.cancel();
      const next = safeExternalUrl(new URL(res.headers.get("location") ?? "", u).toString(), ALLOWED);
      if (!next) throw new Error("The page redirects somewhere USCLive can't follow (often a sign-in page).");
      u = next;
      continue;
    }
    if (!res.ok) throw new Error(`The page answered ${res.status}.`);
    const reader = res.body?.getReader();
    if (!reader) return "";
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { void reader.cancel(); break; } // the tags we need are at the top of the page
      chunks.push(value);
    }
    return new TextDecoder().decode(Buffer.concat(chunks));
  }
  throw new Error("Too many redirects.");
}

/**
 * "Import from Engage or Handshake": read a public event page's title, date, time and location to pre-fill
 * the new-event form. If the page can't be read (many Handshake pages need a sign-in), it says so and the
 * organizer fills the form in by hand. Nothing is created here, and nothing is sent to those sites.
 */
async function POST_(req: Request) {
  const me = sessionUser(req);
  if (!me) return Response.json({ error: "Sign in to import an event." }, { status: 401 });
  if (me.accountType !== "creator") return Response.json({ error: "Only Student Creator accounts can post events." }, { status: 403 });
  const rl = rateLimit(`import:${me.id}`, 10, 60_000);
  if (!rl.ok) return Response.json({ error: `Too many requests. Try again in ${rl.retryAfterS} seconds.` }, { status: 429, headers: { "Retry-After": String(rl.retryAfterS) } });
  const parsed = await body(req, z.object({ url: z.string().trim().min(8).max(500) }).strict());
  if (!parsed.ok) return parsed.res;
  const u = safeExternalUrl(parsed.data.url, ALLOWED);
  if (!u) return Response.json({ error: "Paste an https link to an event on Handshake (joinhandshake.com) or Engage (engage.usc.edu)." }, { status: 400 });
  const source = /joinhandshake\.com$/.test(u.hostname) ? "handshake" : "engage";
  try {
    const found = parseEventPage(await fetchPublicPage(u));
    if (!found) return Response.json({ ok: false, source, url: u.toString(), reason: `USCLive couldn't read that page (it may need a ${source === "handshake" ? "Handshake" : "USC"} sign-in). Fill in the details by hand; the link is kept as the official page.` });
    return Response.json({ ok: true, source, url: u.toString(), prefill: { ...found, buildingId: (found.location && matchBuilding(found.location)) || null } });
  } catch (e) {
    return Response.json({ ok: false, source, url: u.toString(), reason: `USCLive couldn't read that page: ${(e as Error).message} Fill in the details by hand; the link is kept as the official page.` });
  }
}

export const POST = withState(POST_);
