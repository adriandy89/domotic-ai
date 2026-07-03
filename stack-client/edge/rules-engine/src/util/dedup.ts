import { createHash } from 'node:crypto';

/**
 * Idempotency key shared with central dedup. Bucketed to the minute so the same
 * rule acting on the same value within a minute (edge now + central on backfill)
 * collapses to one execution. Mirrors the plan's
 * sha256(ruleId + deviceId + attribute + value + minute).
 */
export function makeDedupKey(
  ruleId: string,
  deviceId: string | null,
  attribute: string,
  value: unknown,
  triggeredAtMs: number,
): string {
  const minute = Math.floor(triggeredAtMs / 60_000);
  return createHash('sha256')
    .update(
      `${ruleId}|${deviceId ?? ''}|${attribute}|${JSON.stringify(value)}|${minute}`,
    )
    .digest('hex')
    .slice(0, 64);
}
