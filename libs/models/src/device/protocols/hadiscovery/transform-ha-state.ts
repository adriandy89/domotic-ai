import { HaEntity } from './ha-config.types';
import {
  evaluateValueTemplate,
  valueJsonField,
} from './evaluate-value-template';

/**
 * HA `state_class` values whose state must be castable to a number — the same
 * set the HA recorder requires before computing statistics.
 * Reference: https://developers.home-assistant.io/docs/core/entity/sensor/#available-state-classes
 */
const NUMERIC_STATE_CLASSES = new Set([
  'measurement',
  'measurement_angle',
  'total',
  'total_increasing',
]);

const NUMERIC_STRING = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;

/**
 * Apply each entity's `value_template` to an aggregate JSON state message
 * (device-based discovery: every component shares one `~/state` topic), the
 * way HA renders a sensor's state from the shared payload. Only entities bound
 * to `topic` are considered; identity templates (`{{value_json.<property>}}`)
 * are no-ops. Values of entities with a numeric `state_class` are coerced to
 * numbers (HA recorder semantics) so aggregations and rules see real numbers.
 * Per-field failures keep the raw value and invoke `onFallback`; unknown/meta
 * keys pass through raw. Returns a new object; never throws.
 */
export function transformAggregateState(
  message: Record<string, unknown>,
  entities: HaEntity[],
  topic: string,
  rawPayload: string,
  onFallback?: (property: string, template: string) => void,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...message };

  for (const entity of entities) {
    if (entity.stateTopic !== topic) continue;

    const template = entity.valueTemplate;
    const field = valueJsonField(template);
    const isIdentity =
      field === entity.property && isIdentityTemplate(template);

    if (template && !isIdentity) {
      const evaluated = evaluateValueTemplate(template, {
        value: rawPayload,
        value_json: message,
      });
      if (evaluated !== undefined) {
        out[entity.property] = evaluated;
      } else if (field !== undefined && !(field in message)) {
        // The payload simply doesn't carry this field this time — not an error.
        continue;
      } else {
        if (field !== undefined) out[entity.property] = message[field];
        onFallback?.(entity.property, template);
      }
    }

    coerceByStateClass(out, entity, onFallback);
  }

  return out;
}

/** True for `{{ value_json.<field> }}` (no expression), per the evaluator's fast path. */
function isIdentityTemplate(template: string | undefined): boolean {
  return (
    typeof template === 'string' &&
    /^\{\{\s*value_json\.[A-Za-z0-9_]+\s*\}\}$/.test(template)
  );
}

/** HA-style numeric guarantee for measurement/total entities. */
function coerceByStateClass(
  out: Record<string, unknown>,
  entity: HaEntity,
  onFallback?: (property: string, template: string) => void,
): void {
  if (!entity.stateClass || !NUMERIC_STATE_CLASSES.has(entity.stateClass))
    return;
  const value = out[entity.property];
  if (typeof value !== 'string') return;
  if (NUMERIC_STRING.test(value.trim())) {
    out[entity.property] = Number(value);
  } else {
    onFallback?.(entity.property, `state_class:${entity.stateClass}`);
  }
}
