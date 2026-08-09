/**
 * Color conversions between Alexa's HSB model and the platform's color
 * representations. Commands go Alexa HSB → hex (the protocol adapter then
 * converts hex to the device's native xy/hs/rgb); state reports go the other
 * way from the device's native value.
 */

export interface AlexaColor {
  hue: number; // 0–360
  saturation: number; // 0–1
  brightness: number; // 0–1
}

export function hsbToHex(color: AlexaColor): string {
  const h = ((color.hue % 360) + 360) % 360;
  const s = clamp01(color.saturation);
  const v = clamp01(color.brightness);
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return (
    '#' +
    [r + m, g + m, b + m]
      .map((ch) =>
        Math.round(ch * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

export function rgbToHsb(r: number, g: number, b: number): AlexaColor {
  const rn = clamp01(r / 255);
  const gn = clamp01(g / 255);
  const bn = clamp01(b / 255);
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let hue = 0;
  if (d !== 0) {
    if (max === rn) hue = 60 * (((gn - bn) / d) % 6);
    else if (max === gn) hue = 60 * ((bn - rn) / d + 2);
    else hue = 60 * ((rn - gn) / d + 4);
  }
  hue = ((hue % 360) + 360) % 360;
  return {
    hue: round2(hue),
    saturation: round2(max === 0 ? 0 : d / max),
    brightness: round2(max),
  };
}

/**
 * CIE xy (+ brightness 0–1) → Alexa HSB. Inverse of the sRGB/D65 conversion
 * used by the zigbee adapter when it sends `{color:{x,y}}`.
 */
export function xyToHsb(x: number, y: number, brightness = 1): AlexaColor {
  if (y <= 0) return { hue: 0, saturation: 0, brightness: clamp01(brightness) };
  const Y = 1;
  const X = (Y / y) * x;
  const Z = (Y / y) * (1 - x - y);
  // XYZ → linear sRGB (D65)
  let r = X * 3.2406 - Y * 1.5372 - Z * 0.4986;
  let g = -X * 0.9689 + Y * 1.8758 + Z * 0.0415;
  let b = X * 0.0557 - Y * 0.204 + Z * 1.057;
  // normalize into gamut, then gamma-encode
  const max = Math.max(r, g, b);
  if (max > 1) {
    r /= max;
    g /= max;
    b /= max;
  }
  const gamma = (ch: number) =>
    ch <= 0.0031308
      ? 12.92 * Math.max(0, ch)
      : 1.055 * Math.pow(Math.max(0, ch), 1 / 2.4) - 0.055;
  const hsb = rgbToHsb(gamma(r) * 255, gamma(g) * 255, gamma(b) * 255);
  return { ...hsb, brightness: round2(clamp01(brightness)) };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
