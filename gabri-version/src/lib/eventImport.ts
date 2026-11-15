/**
 * Reads the public details of an event page (Engage, Handshake) from its own tags: the JSON-LD "Event" block
 * when the page has one, otherwise the Open Graph / meta tags. No imports, so it can be tested on its own.
 * It only reads what the page publishes to everyone; it never signs in and never registers anyone.
 */
export interface ImportedEvent { title: string; description: string; start: string | null; end: string | null; location: string }

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/\s+/g, " ").trim();
const iso = (v: unknown): string | null => { if (typeof v !== "string" || !v.trim()) return null; const d = new Date(v); return isNaN(+d) ? null : d.toISOString(); };

function meta(html: string, names: string[]): string {
  for (const n of names) {
    const tag = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`, "i"))?.[0];
    const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
    if (content) return decode(content);
  }
  return "";
}

/** Every JSON-LD object on the page whose @type is (or includes) "Event", however it is nested. */
function jsonLdEvents(html: string): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  const walk = (v: unknown, depth: number) => {
    if (depth > 6 || !v || typeof v !== "object") return;
    if (Array.isArray(v)) { v.slice(0, 50).forEach((x) => walk(x, depth + 1)); return; }
    const o = v as Record<string, unknown>;
    const t = o["@type"];
    if (t === "Event" || (Array.isArray(t) && t.includes("Event")) || (typeof t === "string" && /Event$/.test(t))) found.push(o);
    if (o["@graph"]) walk(o["@graph"], depth + 1);
  };
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(m[1]), 0); } catch { /* a broken block is skipped */ }
  }
  return found;
}

function placeName(loc: unknown): string {
  if (typeof loc === "string") return decode(loc);
  if (Array.isArray(loc)) return placeName(loc[0]);
  if (loc && typeof loc === "object") {
    const o = loc as Record<string, unknown>;
    const addr = o.address;
    const street = typeof addr === "string" ? addr : addr && typeof addr === "object" ? String((addr as Record<string, unknown>).streetAddress ?? "") : "";
    return decode([typeof o.name === "string" ? o.name : "", street].filter(Boolean).join(", "));
  }
  return "";
}

/** null = nothing usable on the page (for example a sign-in wall). */
export function parseEventPage(html: string): ImportedEvent | null {
  const ld = jsonLdEvents(html)[0];
  const pageTitle = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const title = (typeof ld?.name === "string" ? decode(ld.name) : "") || meta(html, ["og:title", "twitter:title"]) || pageTitle;
  const description = ((typeof ld?.description === "string" ? decode(ld.description) : "") || meta(html, ["og:description", "description", "twitter:description"])).slice(0, 1000);
  const start = iso(ld?.startDate) ?? iso(meta(html, ["event:start_time", "og:start_time", "startDate"]));
  const end = iso(ld?.endDate) ?? iso(meta(html, ["event:end_time", "og:end_time", "endDate"]));
  const location = (placeName(ld?.location) || meta(html, ["event:location", "og:location", "place:location:name"])).slice(0, 120);
  // a sign-in wall or an app shell has a generic title and no event details: treat it as unreadable
  const generic = !title || /^(sign in|log in|login|handshake|engage|home|welcome)\b/i.test(title) || title.length < 4;
  if (generic && !start) return null;
  return { title: title.slice(0, 100), description, start, end, location };
}
