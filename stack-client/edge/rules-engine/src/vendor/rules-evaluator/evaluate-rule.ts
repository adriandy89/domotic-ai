import { evaluateCondition } from './evaluate-condition';
import { EvaluatorCondition } from './types';

/**
 * Evaluate a rule's conditions against the device whose telemetry just arrived.
 *
 * Pure: the caller supplies `otherDevicesData` (device_id → latest data) for any
 * cross-device conditions in ALL mode. The central engine builds this map from a
 * `sensorDataLast` query; the edge engine builds it from SQLite. This keeps rule
 * semantics identical on both sides.
 *
 * - `all === false` (OR): true if ANY of the current device's conditions match.
 * - `all === true`  (AND): every current-device condition must match AND every
 *   other-device condition must match against `otherDevicesData` (missing data
 *   for a referenced device fails the rule).
 */
export function evaluateRule(
  rule: { all: boolean; conditions: EvaluatorCondition[] },
  currentDeviceId: string,
  newData: Record<string, any>,
  otherDevicesData: Map<string, Record<string, any>> = new Map(),
): boolean {
  if (rule.conditions.length === 0) {
    return true;
  }

  const currentDeviceConditions = rule.conditions.filter(
    (c) => c.device_id === currentDeviceId,
  );
  const currentDeviceResults = currentDeviceConditions.map((condition) =>
    evaluateCondition(condition, newData[condition.attribute]),
  );

  if (!rule.all) {
    return currentDeviceResults.some((result) => result);
  }

  const allCurrentPass = currentDeviceResults.every((result) => result);
  if (!allCurrentPass) {
    return false;
  }

  // ALL mode: cross-device conditions must also hold against the supplied data.
  const otherDeviceConditions = rule.conditions.filter(
    (c) => c.device_id !== currentDeviceId,
  );
  if (otherDeviceConditions.length === 0) {
    return true;
  }

  for (const condition of otherDeviceConditions) {
    const deviceData = otherDevicesData.get(condition.device_id);
    if (!deviceData) {
      return false;
    }
    if (!evaluateCondition(condition, deviceData[condition.attribute])) {
      return false;
    }
  }

  return true;
}
