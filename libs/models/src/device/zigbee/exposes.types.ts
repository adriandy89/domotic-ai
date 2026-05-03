/**
 * Mirrors the structure of zigbee2mqtt `exposes` entries.
 * Reference: https://www.zigbee2mqtt.io/guide/usage/exposes.html
 *
 * `access` is a bitmask: 0b001=published, 0b010=set (writable), 0b100=get.
 */
export interface DeviceExpose {
  name?: string;
  type: string;
  label?: string;
  access?: number;
  property?: string;
  unit?: string;
  category?: string;
  value_on?: boolean | string | number;
  value_off?: boolean | string | number;
  value_toggle?: boolean | string | number;
  value_max?: number;
  value_min?: number;
  value_step?: number;
  values?: (string | number)[];
  description?: string;
  features?: DeviceExpose[];
  endpoint?: string;
  presets?: { name: string; value: number | string; description?: string }[];
}

/**
 * A normalized, write-capable action derived from one or more exposes.
 * `color_xy`/`color_hs`/`color_rgb` composites collapse into a single `color` action.
 */
export interface DeviceAction {
  property: string;
  type: string;
  label?: string;
  description?: string;
  unit?: string;
  valueOn?: boolean | string | number;
  valueOff?: boolean | string | number;
  valueToggle?: boolean | string | number;
  valueMin?: number;
  valueMax?: number;
  valueStep?: number;
  values?: (string | number)[];
  /** Color-only: which composite formats this device accepts ('xy' | 'hs' | 'rgb'). */
  colorFormats?: ('xy' | 'hs' | 'rgb')[];
}

export const ACCESS_PUBLISHED = 0b001;
export const ACCESS_SET = 0b010;
export const ACCESS_GET = 0b100;

export const COLOR_COMPOSITE_NAMES = [
  'color_xy',
  'color_hs',
  'color_rgb',
] as const;
export type ColorCompositeName = (typeof COLOR_COMPOSITE_NAMES)[number];
