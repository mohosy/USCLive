/** Live score simulation for demo games. Deterministic from the start time, so every viewer sees the same score. */
import type { GameInfo } from "./types";

/** Team badges: school colors and a short name (drawn as colored badges, not official logos). */
export const TEAMS: Record<string, { name: string; bg: string; fg: string }> = {
  USC: { name: "USC Trojans", bg: "#990000", fg: "#FFCC00" },
  UCLA: { name: "UCLA Bruins", bg: "#2D68C4", fg: "#F2A900" },
  ORE: { name: "Oregon Ducks", bg: "#154733", fg: "#FEE123" },
};
export const team = (abbr: string) => TEAMS[abbr] ?? { name: abbr, bg: "#3a3a3c", fg: "#ffffff" };

const RULES = {
  football: { periods: 4, periodMin: 15, realPerGameMin: 3.2, label: (p: number) => `Q${p}` },
  basketball: { periods: 2, periodMin: 20, realPerGameMin: 2, label: (p: number) => `${p}H` },
  volleyball: { periods: 5, periodMin: 12, realPerGameMin: 2, label: (p: number) => `Set ${p}` },
} as const;

function hash(n: number) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export interface GameState { period: string; clock: string; home: number; away: number; final: boolean; started: boolean }

export function gameState(g: GameInfo, startIso: string, now = new Date()): GameState {
  const r = RULES[g.sport];
  const elapsedRealMin = (+now - +new Date(startIso)) / 60_000;
  if (elapsedRealMin < 0) return { period: "", clock: "", home: 0, away: 0, final: false, started: false };
  const total = r.periods * r.periodMin;
  const gm = Math.min(total, elapsedRealMin / r.realPerGameMin);
  const final = gm >= total;
  const period = Math.min(r.periods, Math.floor(gm / r.periodMin) + 1);
  const left = final ? 0 : r.periodMin - (gm % r.periodMin);
  const mm = Math.floor(left), ss = Math.floor((left - mm) * 60);
  // points arrive in plausible chunks: football 7/3 per scoring drive, others in 1-3 point steps
  const score = (rate: number, seed: number) => {
    if (g.sport === "football") {
      let pts = 0;
      for (let block = 0; block < Math.floor(gm / 4); block++) {
        // rate = chance of a score in each 4-minute block; 70% touchdowns, 30% field goals
        const h = hash(seed * 1000 + block);
        if (h < rate) pts += h < rate * 0.7 ? 7 : 3;
      }
      return pts;
    }
    let pts = 0;
    for (let m = 0; m < Math.floor(gm * 2); m++) {
      // rate = points per minute; ~2.1 points per scoring possession
      const p = rate / 4.2;
      const h = hash(seed * 1000 + m);
      if (h < p) pts += h < p * 0.25 ? 3 : h > p * 0.85 ? 1 : 2;
    }
    return pts;
  };
  return {
    period: final ? "Final" : r.label(period),
    clock: final ? "" : `${mm}:${String(ss).padStart(2, "0")}`,
    home: score(g.homeRate, 1),
    away: score(g.awayRate, 2),
    final,
    started: true,
  };
}
