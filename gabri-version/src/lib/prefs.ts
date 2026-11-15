/**
 * Settings that are yours to change: your Trojan's look, privacy, notifications, map.
 * Privacy starts all off. Anything sent by the browser goes through `mergePrefs`, which keeps only the
 * fields and values that exist: unknown keys and bad values are dropped, never trusted.
 * No runtime imports, so it can be checked on its own (scripts/check-friends.mjs).
 */
import type { UserPrefs } from "./types";

export const DEFAULT_PREFS: UserPrefs = {
  trojan: { plume: "cardinal", cape: "cardinal", jersey: 7 },
  privacy: { shareLocation: false, showGoing: false, schedule: "nobody" },
  notify: { registered: true, deadlines: true, food: true, safety: true },
  map: { openIn: "explore" },
};

const PLUMES = ["cardinal", "gold", "white", "black"] as const;
const CAPES = ["cardinal", "gold"] as const;
const SCHEDULE = ["nobody", "friends", "all"] as const;
const OPEN_IN = ["explore", "satellite"] as const;

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], keep: T): T => (typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : keep);
const bool = (v: unknown, keep: boolean) => (typeof v === "boolean" ? v : keep);

/** Your saved settings with the defaults filled in. */
export function prefsOf(u: { prefs?: UserPrefs }): UserPrefs {
  return mergePrefs(DEFAULT_PREFS, u.prefs);
}

/** `base` with the valid parts of `patch` applied. A partial patch changes only what it names. */
export function mergePrefs(base: UserPrefs, patch: unknown): UserPrefs {
  const p = obj(patch), t = obj(p.trojan), pr = obj(p.privacy), n = obj(p.notify), m = obj(p.map);
  const jersey = typeof t.jersey === "number" && Number.isInteger(t.jersey) && t.jersey >= 0 && t.jersey <= 99 ? t.jersey : base.trojan.jersey;
  return {
    trojan: { plume: oneOf(t.plume, PLUMES, base.trojan.plume), cape: oneOf(t.cape, CAPES, base.trojan.cape), jersey },
    privacy: {
      shareLocation: bool(pr.shareLocation, base.privacy.shareLocation),
      showGoing: bool(pr.showGoing, base.privacy.showGoing),
      schedule: oneOf(pr.schedule, SCHEDULE, base.privacy.schedule),
    },
    notify: {
      registered: bool(n.registered, base.notify.registered),
      deadlines: bool(n.deadlines, base.notify.deadlines),
      food: bool(n.food, base.notify.food),
      safety: bool(n.safety, base.notify.safety),
    },
    map: { openIn: oneOf(m.openIn, OPEN_IN, base.map.openIn) },
  };
}

/** Which of your notification switches a notification falls under (null: always shown). */
export function notifySwitch(n: { kind: string; body?: string }): keyof UserPrefs["notify"] | null {
  if (n.kind === "deadline") return "deadlines";
  if (n.kind === "food") return "food";
  if (n.kind === "safety") return "safety";
  if (n.kind === "event" && /^Starts in /.test(n.body ?? "")) return "registered"; // the reminder before an event you registered for
  return null;
}
