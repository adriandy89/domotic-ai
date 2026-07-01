import { DeviceAction, NormalizeResult, NormalizeWarning } from '../types';

/**
 * Conversions applied:
 * - Brightness ≤1 with decimals → fraction → 0..valueMax.
 * - Brightness 2..100 with valueMax=254 (and percent flag) → percent → 0..254.
 * - color_temp >1000 (Kelvin) → mireds via 1e6/K.
 * - state strings ("on"/"off"/"toggle", any case) → exact valueOn/valueOff/valueToggle.
 * - color: "#RRGGBB" string → { hex: "#RRGGBB" }.
 * - color: { hex } → device-native { x,y } / { hue,saturation } / { r,g,b } per supported format.
 *
 * Pure: no I/O, no DB. Returns a new command, never mutates input.
 */
export function normalizeCommand(
  command: Record<string, unknown>,
  actions: DeviceAction[],
  options: { assumePercentBrightness?: boolean } = {},
): NormalizeResult {
  const out: Record<string, unknown> = { ...command };
  const warnings: NormalizeWarning[] = [];

  for (const key of Object.keys(out)) {
    const action = actions.find((a) => a.property === key);
    if (!action) continue;

    const value = out[key];

    if (key === 'brightness' && typeof value === 'number') {
      const max = action.valueMax ?? 254;
      if (value > 0 && value <= 1) {
        const scaled = Math.round(value * max);
        out[key] = scaled;
        warnings.push({
          property: key,
          message: `brightness ${value} interpreted as fraction; scaled to ${scaled} (range 0-${max}).`,
        });
      } else if (
        options.assumePercentBrightness &&
        max === 254 &&
        value > 1 &&
        value <= 100 &&
        Number.isInteger(value)
      ) {
        const scaled = Math.round((value / 100) * 254);
        out[key] = scaled;
        warnings.push({
          property: key,
          message: `brightness ${value} interpreted as percent; scaled to ${scaled} (range 0-254).`,
        });
      }
      continue;
    }

    if (key === 'color_temp' && typeof value === 'number' && value > 1000) {
      const mireds = Math.round(1_000_000 / value);
      out[key] = mireds;
      warnings.push({
        property: key,
        message: `color_temp ${value} (Kelvin) converted to ${mireds} mireds.`,
      });
      continue;
    }

    if (action.type === 'binary' && typeof value === 'string') {
      const lower = value.toLowerCase();
      if (lower === 'on' && action.valueOn !== undefined)
        out[key] = action.valueOn;
      else if (lower === 'off' && action.valueOff !== undefined)
        out[key] = action.valueOff;
      else if (lower === 'toggle' && action.valueToggle !== undefined)
        out[key] = action.valueToggle;
      continue;
    }

    if (action.type === 'color' && key === 'color') {
      out[key] = normalizeColorValue(value, action, warnings);
      continue;
    }
  }

  return { command: out, warnings };
}

function normalizeColorValue(
  value: unknown,
  action: DeviceAction,
  warnings: NormalizeWarning[],
): unknown {
  let hex: string | undefined;

  if (typeof value === 'string') {
    hex = value;
  } else if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (typeof v.hex === 'string') hex = v.hex;
    else if (typeof v.x === 'number' && typeof v.y === 'number') return value;
    else if (typeof v.hue === 'number' && typeof v.saturation === 'number')
      return value;
    else if (
      typeof v.r === 'number' &&
      typeof v.g === 'number' &&
      typeof v.b === 'number'
    )
      return value;
  }

  if (!hex) return value;

  const rgb = hexToRgb(hex);
  if (!rgb) {
    warnings.push({
      property: 'color',
      message: `color "${hex}" is not a valid hex; sent as-is.`,
    });
    return value;
  }

  const formats = action.colorFormats ?? ['xy'];
  if (formats.includes('xy')) {
    const xy = rgbToXy(rgb);
    return { x: xy.x, y: xy.y };
  }
  if (formats.includes('hs')) {
    const hs = rgbToHs(rgb);
    return { hue: hs.hue, saturation: hs.saturation };
  }
  return { r: rgb.r, g: rgb.g, b: rgb.b };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function rgbToXy(rgb: { r: number; g: number; b: number }): {
  x: number;
  y: number;
} {
  const norm = (c: number) => {
    const v = c / 255;
    return v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92;
  };
  const r = norm(rgb.r);
  const g = norm(rgb.g);
  const b = norm(rgb.b);
  const X = r * 0.4124 + g * 0.3576 + b * 0.1805;
  const Y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const Z = r * 0.0193 + g * 0.1192 + b * 0.9505;
  const sum = X + Y + Z;
  if (sum === 0) return { x: 0, y: 0 };
  return { x: round4(X / sum), y: round4(Y / sum) };
}

function rgbToHs(rgb: { r: number; g: number; b: number }): {
  hue: number;
  saturation: number;
} {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { hue: Math.round(h), saturation: Math.round(s * 100) };
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
