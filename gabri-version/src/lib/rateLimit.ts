/**
 * A basic per-person rate limit, kept in this server's memory: at most `limit` requests per `windowMs`
 * for one key. Good enough to stop a runaway script or a button held down; on a host that runs several
 * server copies each copy counts on its own, so treat it as a brake, not a guarantee.
 */
const g = globalThis as unknown as { __uscliveRate?: Map<string, number[]> };
const hits = () => (g.__uscliveRate ??= new Map<string, number[]>());

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): { ok: true } | { ok: false; retryAfterS: number } {
  const store = hits();
  const recent = (store.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    store.set(key, recent);
    return { ok: false, retryAfterS: Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000)) };
  }
  recent.push(now);
  store.set(key, recent);
  // keep the map small: forget keys that have gone quiet
  if (store.size > 5000) for (const [k, v] of store) if (!v.some((t) => now - t < windowMs)) store.delete(k);
  return { ok: true };
}
