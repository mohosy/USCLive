import { matchBuilding } from "./campus";

// "how do i get to THH", "directions to Leavey", "take me to the Village", "walk me to SGM"...
const NAV =
  /\b(how\s+(do|can|would|should)\s+i\s+(get|go|walk)\s+to|how\s+to\s+(get|go|walk)\s+to|directions?\s+(to|for)|take\s+me\s+to|walk\s+me\s+to|guide\s+me\s+to|show\s+me\s+(the\s+way|how)\s+to|navigate\s+to|route\s+to|get\s+me\s+to|way\s+to|walk\s+to|get\s+to)\b/i;

/** Returns null if the question isn't asking for directions; otherwise the matched building (or null if unknown). */
export function parseNavQuery(q: string): { buildingId: string | null } | null {
  const m = q.match(NAV);
  if (!m || m.index == null) return null;
  const rest = q.slice(m.index + m[0].length);
  return { buildingId: matchBuilding(rest) ?? matchBuilding(q) ?? null };
}
