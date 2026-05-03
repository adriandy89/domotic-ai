import {
  ACCESS_SET,
  COLOR_COMPOSITE_NAMES,
  ColorCompositeName,
  DeviceAction,
  DeviceExpose,
} from './exposes.types';

/**
 * Returns leaf exposes (depth-first), skipping intermediate `composite`/`light`/`switch` wrappers.
 * Composites that are themselves leaves (no `features`) are kept.
 */
export function flattenExposes(exposes: DeviceExpose[]): DeviceExpose[] {
  const result: DeviceExpose[] = [];
  for (const expose of exposes) {
    if (expose.features && expose.features.length > 0) {
      result.push(...flattenExposes(expose.features));
    } else if (expose.property || expose.name) {
      result.push(expose);
    }
  }
  return result;
}

/**
 * Derives writable actions from a device's `exposes`.
 *
 * Rules:
 * - Only exposes (or features) with `access & ACCESS_SET` are returned.
 * - `color_xy` / `color_hs` / `color_rgb` composites collapse into a single `color` action,
 *   capturing which formats the device supports.
 * - Other composites (`light`, `switch`, `climate`, ...) are recursed into.
 * - Properties are deduped by name (first wins).
 */
export function getAvailableActions(exposes: DeviceExpose[]): DeviceAction[] {
  const actions: DeviceAction[] = [];
  const colorFormats = new Set<'xy' | 'hs' | 'rgb'>();
  let colorLabel: string | undefined;

  function processExpose(expose: DeviceExpose): void {
    if (
      expose.type === 'composite' &&
      COLOR_COMPOSITE_NAMES.includes(expose.name as ColorCompositeName)
    ) {
      const hasWriteAccess = expose.features?.some(
        (f) => f.access !== undefined && (f.access & ACCESS_SET) !== 0,
      );
      if (hasWriteAccess) {
        const fmt = (expose.name as ColorCompositeName).replace(
          'color_',
          '',
        ) as 'xy' | 'hs' | 'rgb';
        colorFormats.add(fmt);
        colorLabel ??= expose.label || 'Color';
      }
      return;
    }

    if (expose.features && expose.features.length > 0) {
      for (const feature of expose.features) {
        processExpose(feature);
      }
      return;
    }

    if (
      expose.access !== undefined &&
      (expose.access & ACCESS_SET) !== 0 &&
      (expose.property || expose.name)
    ) {
      const action: DeviceAction = {
        property: expose.property || expose.name || '',
        type: expose.type,
        label: expose.label,
        description: expose.description,
        unit: expose.unit,
      };

      if (expose.type === 'binary') {
        action.valueOn = expose.value_on ?? true;
        action.valueOff = expose.value_off ?? false;
        if (expose.value_toggle !== undefined)
          action.valueToggle = expose.value_toggle;
      } else if (expose.type === 'numeric') {
        action.valueMin = expose.value_min;
        action.valueMax = expose.value_max;
        action.valueStep = expose.value_step;
      } else if (expose.type === 'enum' && expose.values) {
        action.values = expose.values;
      }

      actions.push(action);
    }
  }

  for (const expose of exposes) {
    processExpose(expose);
  }

  if (colorFormats.size > 0) {
    actions.push({
      property: 'color',
      type: 'color',
      label: colorLabel,
      description:
        'Send color as { "color": { "hex": "#RRGGBB" } }; will be converted to the device-native format.',
      colorFormats: Array.from(colorFormats),
    });
  }

  const seen = new Set<string>();
  return actions.filter((action) => {
    if (seen.has(action.property)) return false;
    seen.add(action.property);
    return true;
  });
}

/**
 * Convenience wrapper: extracts the exposes array from a device's `attributes` JSON
 * (the raw payload zigbee2mqtt sends in `bridge/devices`).
 */
export function getExposesFromAttributes(attributes: unknown): DeviceExpose[] {
  if (!attributes || typeof attributes !== 'object') return [];
  const def = (attributes as { definition?: { exposes?: unknown } }).definition;
  if (!def || !Array.isArray(def.exposes)) return [];
  return def.exposes as DeviceExpose[];
}
