/**
 * Spending guard for the OpenAI key. Every model call (assistant turn, event extraction, inbox scan...)
 * asks for an allowance first; when a limit is hit the caller falls back to its rule-based answer,
 * so the app keeps working, just without the model.
 *  - burst: a few calls per person per minute (in memory, per server instance)
 *  - daily: per person and for the whole app (saved with the app state, so it holds across instances)
 */
import { currentUserId, db } from "./store";

const PER_MINUTE = Number(process.env.AI_PER_MINUTE ?? 60);
const PER_USER_DAY = Number(process.env.AI_PER_USER_DAY ?? 2000);
const PER_APP_DAY = Number(process.env.AI_PER_APP_DAY ?? 10000);

export class AiLimitError extends Error {}

const recent = new Map<string, number[]>();
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

/** Take one model call from the allowance, or throw AiLimitError. */
export function takeAiCall(): void {
  const uid = currentUserId();
  const now = Date.now();
  const mine = (recent.get(uid) ?? []).filter((t) => now - t < 60_000);
  if (mine.length >= PER_MINUTE) throw new AiLimitError("Too many assistant requests right now; try again in a minute.");

  const d = db();
  const day = today();
  if (!d.aiUsage || d.aiUsage.day !== day) d.aiUsage = { day, total: 0, byUser: {} };
  const u = d.aiUsage;
  if (u.total >= PER_APP_DAY) throw new AiLimitError("The assistant hit today's limit.");
  if ((u.byUser[uid] ?? 0) >= PER_USER_DAY) throw new AiLimitError("You hit today's assistant limit.");

  mine.push(now);
  recent.set(uid, mine);
  u.total += 1;
  u.byUser[uid] = (u.byUser[uid] ?? 0) + 1;
}
