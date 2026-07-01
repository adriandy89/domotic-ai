/**
 * Pure timing helpers for the absence operators (STALE / INACTIVE). The threshold
 * arithmetic and the "what counts as active" rule live here; the caller supplies
 * the timestamps (from `sensorDataLast` / `deviceStateEvent` on central, or from
 * SQLite on the edge). This keeps watchdog semantics identical on both sides.
 */

// Values that count as "active" for a presence/contact-style attribute when
// stored as a string in device state events.
export const ACTIVE_VALUES = new Set(['true', 'on', '1', 'detected', 'open']);

/**
 * Whether a reported value counts as "active". Matches the configured target
 * (case-insensitive) when present, and also accepts canonical active tokens so a
 * sensor reporting "ON" still counts when the target is `true`.
 */
export function isActiveValue(value: unknown, target?: unknown): boolean {
  const v = String(value).toLowerCase();
  if (target !== undefined && target !== null && target !== '') {
    if (v === String(target).toLowerCase()) return true;
  }
  return ACTIVE_VALUES.has(v);
}

/** STALE: the device hasn't reported at all for longer than the threshold. */
export function isStale(
  nowMs: number,
  lastReportMs: number,
  thresholdMs: number,
): boolean {
  return nowMs - lastReportMs > thresholdMs;
}

/** INACTIVE: the attribute hasn't been "active" for longer than the threshold. */
export function isInactive(
  nowMs: number,
  lastActiveMs: number,
  thresholdMs: number,
): boolean {
  return nowMs - lastActiveMs > thresholdMs;
}

/**
 * An absence episode re-arms only once the device recovers (reports again / goes
 * active) AFTER the last alert. `null` lastAlert = never alerted, so always fresh.
 */
export function isFresh(
  lastAlertMs: number | null,
  lastRelevantMs: number,
): boolean {
  return lastAlertMs === null || lastRelevantMs > lastAlertMs;
}

/** Parse and validate a condition's `data.forSeconds`; returns null when invalid. */
export function parseForSeconds(data: any): number | null {
  const forSeconds = Number(data?.forSeconds);
  if (!Number.isFinite(forSeconds) || forSeconds <= 0) return null;
  return forSeconds;
}
