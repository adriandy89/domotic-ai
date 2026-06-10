/**
 * Detection of loggable state transitions between two consecutive payloads of
 * a device (HA logbook model): only actual changes of non-numeric scalar
 * states are recorded — never repeated readings. Numeric fields are
 * measurements (served by the per-field statistics), and meta/timestamp keys
 * are transport noise; both are excluded. Protocol-agnostic: works for
 * HA-Discovery (relay "ON"/"OFF", trigger "remote") and Zigbee (contact
 * true/false, action "single") alike.
 */

/** One loggable state change between two consecutive payloads of a device. */
export interface StateTransition {
  property: string;
  prevValue: string | null;
  value: string;
}

/** Keys that describe the message itself, never a state worth logging. */
const EXCLUDED_KEYS = new Set([
  'device',
  'ts',
  'timestamp',
  'last_seen',
  'update',
]);

const NUMERIC_STRING = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;
const ISO_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}T/;

/** Defensive cap: a payload should never yield more transitions than this. */
const MAX_TRANSITIONS_PER_MESSAGE = 20;

/**
 * Compare two consecutive payloads and return the state transitions to log.
 * A field qualifies only when it is a boolean or a non-numeric, non-date
 * string scalar on BOTH sides and its serialized value differs — so
 * heartbeats, retained re-deliveries and QoS1 duplicates yield zero rows.
 */
export function detectStateTransitions(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
): StateTransition[] {
  const transitions: StateTransition[] = [];

  for (const [key, nextValue] of Object.entries(next)) {
    if (transitions.length >= MAX_TRANSITIONS_PER_MESSAGE) break;
    if (EXCLUDED_KEYS.has(key)) continue;
    if (!(key in prev)) continue; // no "first seen" noise

    const nextState = asLoggableState(nextValue);
    const prevState = asLoggableState(prev[key]);
    if (nextState === undefined || prevState === undefined) continue;
    if (nextState === prevState) continue;

    transitions.push({ property: key, prevValue: prevState, value: nextState });
  }

  return transitions;
}

/**
 * Serialize a value when it is a loggable state (boolean or non-numeric,
 * non-ISO-date string); `undefined` otherwise (numbers, arrays, objects…).
 */
function asLoggableState(value: unknown): string | undefined {
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (NUMERIC_STRING.test(trimmed)) return undefined;
    if (ISO_DATE_PREFIX.test(trimmed)) return undefined;
    return value;
  }
  return undefined;
}
