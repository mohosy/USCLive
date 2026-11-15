import { z } from "zod";

export async function body<S extends z.ZodType>(req: Request, schema: S): Promise<{ ok: true; data: z.infer<S> } | { ok: false; res: Response }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, res: Response.json({ error: "Invalid JSON" }, { status: 400 }) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, res: Response.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 }) };
  return { ok: true, data: parsed.data };
}

/** "2026-11-14T19:00" (local) or full ISO -> ISO string; null if invalid */
export function toIso(local: string | null | undefined): string | null {
  if (!local) return null;
  const d = new Date(local);
  return isNaN(+d) ? null : d.toISOString();
}

/** Only allow fetching public https URLs (basic SSRF guard). */
export function safeExternalUrl(raw: string, allowHosts?: RegExp): URL | null {
  try {
    const u = new URL(raw.replace(/^webcal:/i, "https:"));
    if (u.protocol !== "https:") return null;
    const h = u.hostname;
    if (h === "localhost" || /^(\d+\.){3}\d+$/.test(h) || h.includes(":") || h.endsWith(".local") || h.endsWith(".internal")) return null;
    if (allowHosts && !allowHosts.test(h)) return null;
    return u;
  } catch {
    return null;
  }
}

/**
 * Fetch a public page as text. Redirects are followed by hand, at most four, and every hop is checked again with
 * safeExternalUrl (and the same host allow-list): a checked address must not be able to bounce the server to an
 * internal one.
 */
export async function fetchText(u: URL, maxBytes = 2_000_000, allowHosts?: RegExp) {
  let res: Response | null = null;
  let here = u;
  for (let hop = 0; hop < 5; hop++) {
    res = await fetch(here, { headers: { "User-Agent": "USCLive/0.1 (student hackathon project)" }, signal: AbortSignal.timeout(12_000), redirect: "manual" });
    if (res.status < 300 || res.status >= 400) break;
    const next = safeExternalUrl(new URL(res.headers.get("location") ?? "", here).toString(), allowHosts);
    void res.body?.cancel();
    if (!next || hop === 4) throw new Error("That address redirects somewhere this app will not fetch.");
    here = next;
  }
  if (!res || !res.ok) throw new Error(`Fetch failed: ${res?.status ?? "no response"}`);
  if (Number(res.headers.get("content-length") ?? 0) > maxBytes) { void res.body?.cancel(); throw new Error("Response too large"); }
  // read in chunks and stop the moment it's over the limit (the header can be missing or wrong)
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { void reader.cancel(); throw new Error("Response too large"); }
    chunks.push(value);
  }
  const buf = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { buf.set(c, at); at += c.byteLength; }
  return new TextDecoder().decode(buf);
}
