import { Operation } from './enums';
import { EvaluatorCondition } from './types';

/**
 * Evaluate a single condition's comparison operator against an incoming value.
 *
 * Pure: no I/O. Absence operators (STALE/INACTIVE) are NOT handled here — they
 * depend on timing state and live in {@link ./watchdog}. Returns false for a
 * missing value or a missing/absence operator so callers can gate safely.
 */
export function evaluateCondition(
  condition: Pick<EvaluatorCondition, 'operation' | 'data'>,
  value: any,
): boolean {
  if (value === undefined || value === null) {
    return false;
  }

  let targetValue = (condition.data as { value: any })?.value;
  if (targetValue === undefined) {
    return false;
  }

  // The UI may persist a numeric target as a string (e.g. "10.6"). When the incoming
  // value is a number, coerce a numeric-looking target so `=`/`>`/`<` compare number
  // vs number (strict `===` otherwise never matches: 10.6 === "10.6" is false).
  if (
    typeof value === 'number' &&
    typeof targetValue === 'string' &&
    targetValue.trim() !== '' &&
    !Number.isNaN(Number(targetValue))
  ) {
    targetValue = Number(targetValue);
  }

  switch (condition.operation) {
    case Operation.EQ:
      return value === targetValue;
    case Operation.GT:
      return value > targetValue;
    case Operation.GTE:
      return value >= targetValue;
    case Operation.LT:
      return value < targetValue;
    case Operation.LTE:
      return value <= targetValue;
    default:
      return false;
  }
}
