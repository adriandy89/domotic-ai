/**
 * Tiny stale-while-revalidate + request-dedupe registry (no deps).
 *
 * Two complementary APIs sharing one in-memory registry:
 *
 *  - Store-backed data (value lives in a zustand store): guard the fetch with
 *    `shouldFetch(key, ttl, force)` and register the promise with
 *    `trackInflight(key, p)`. The store keeps the data; we only track freshness
 *    and in-flight state here.
 *
 *  - Component-level data (no store to hold it, e.g. Access stats): use
 *    `cachedFetch(key, ttl, fn, { force })`, which also caches the resolved
 *    value so it survives unmount/navigation, and `peekCache(key)` to read it
 *    synchronously for the initial render.
 *
 * Freshness is process-wide and resets on full page reload — exactly what we
 * want for "don't refetch on every navigation, but do revalidate when stale".
 */

interface Entry<T = unknown> {
  /** Epoch ms of the last successful settle; 0 = never fetched. */
  at: number;
  /** In-flight promise, if a fetch is currently running. */
  inflight: Promise<T> | null;
  /** Last resolved value (only populated by `cachedFetch`). */
  value?: T;
  hasValue?: boolean;
}

const registry = new Map<string, Entry>();

function entry(key: string): Entry {
  let e = registry.get(key);
  if (!e) {
    e = { at: 0, inflight: null };
    registry.set(key, e);
  }
  return e;
}

/**
 * Should a fetch run now? `false` when a fetch is already in flight (dedupe) or
 * the data is still fresh (`now - at < ttlMs`); `true` when stale or forced.
 */
export function shouldFetch(key: string, ttlMs: number, force = false): boolean {
  const e = registry.get(key);
  if (e?.inflight) return false;
  if (force) return true;
  if (!e || e.at === 0) return true;
  return Date.now() - e.at >= ttlMs;
}

/**
 * Register the in-flight promise for `key`. On settle, records the fetch time
 * and clears the in-flight marker (so the next stale check works).
 */
export function trackInflight<T>(key: string, p: Promise<T>): Promise<T> {
  const e = entry(key);
  e.inflight = p as Promise<unknown>;
  void p.finally(() => {
    const cur = registry.get(key);
    if (!cur) return;
    cur.inflight = null;
    cur.at = Date.now();
  });
  return p;
}

/** Mark `key` stale (and drop any cached value) — call after writes / on logout. */
export function invalidate(...keys: string[]): void {
  for (const key of keys) registry.delete(key);
}

/** Drop everything — call on logout / auth change so a re-login refetches. */
export function invalidateAll(): void {
  registry.clear();
}

/** Synchronously read the last cached value for `key` (see `cachedFetch`). */
export function peekCache<T>(key: string): T | undefined {
  const e = registry.get(key);
  return e?.hasValue ? (e.value as T) : undefined;
}

/**
 * Value-caching variant for data that has no store to live in. Returns the
 * cached value when fresh, dedupes concurrent calls, and otherwise runs `fn`
 * and caches its result.
 */
export async function cachedFetch<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
  opts: { force?: boolean } = {},
): Promise<T> {
  const e = entry(key);
  if (e.inflight) return e.inflight as Promise<T>;
  if (!opts.force && e.hasValue && Date.now() - e.at < ttlMs) {
    return e.value as T;
  }
  const p = fn().then(
    (value) => {
      const cur = entry(key);
      cur.value = value;
      cur.hasValue = true;
      return value;
    },
  );
  trackInflight(key, p);
  return p;
}
