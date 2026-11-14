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

export async function fetchText(u: URL, maxBytes = 2_000_000) {
  const res = await fetch(u, { headers: { "User-Agent": "USCLive/0.1 (student hackathon project)" }, signal: AbortSignal.timeout(12_000), redirect: "follow" });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > maxBytes) throw new Error("Response too large");
  return new TextDecoder().decode(buf);
}
