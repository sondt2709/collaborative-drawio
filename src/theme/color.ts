/** A color pair: [light, dark]. */
export type LD = [string, string];

/** The only way dgm writes a color. */
export function ld(c: LD): string {
  return `light-dark(${c[0]},${c[1]})`;
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHex(s: string): boolean {
  return HEX.test(s);
}

export function parseHex(s: string): [number, number, number] | undefined {
  const m = HEX.exec(s.trim());
  if (!m) return undefined;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

export function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

/** WCAG contrast ratio, 1 to 21. */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Split "light-dark(a,b)" into [a, b]. */
export function parseLightDark(v: string): LD | undefined {
  const m = /^light-dark\(\s*([^,()]+?)\s*,\s*([^,()]+?)\s*\)$/i.exec(v.trim());
  return m ? [m[1], m[2]] : undefined;
}

/**
 * An approximation of how draw.io shows a plain color in dark mode with
 * adaptiveColors="auto": the lightness is inverted, the hue is kept.
 */
export function invertLightness(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb.map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  const l2 = 1 - l;
  const q = l2 < 0.5 ? l2 * (1 + s) : l2 + s - l2 * s;
  const p = 2 * l2 - q;
  const hue = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return toHex(s ? [hue(h + 1 / 3) * 255, hue(h) * 255, hue(h - 1 / 3) * 255] : [l2 * 255, l2 * 255, l2 * 255]);
}

const NAMED: Record<string, string> = {
  white: '#FFFFFF',
  black: '#000000',
  red: '#FF0000',
  green: '#008000',
  blue: '#0000FF',
  gray: '#808080',
  grey: '#808080',
  yellow: '#FFFF00',
  orange: '#FFA500',
};

/** True for a color value that is not light-dark(), none or a draw.io keyword. */
export function isRawColor(v: string): boolean {
  const t = v.trim().toLowerCase();
  if (!t || t === 'none' || t === 'default' || t === 'inherit' || t === 'swimlane' || t === 'indicated') return false;
  if (t.startsWith('light-dark(')) return false;
  return t.startsWith('#') || t.startsWith('rgb') || t.startsWith('hsl') || t in NAMED;
}

export function namedToHex(v: string): string | undefined {
  const t = v.trim().toLowerCase();
  if (isHex(t)) return toHex(parseHex(t)!);
  return NAMED[t];
}
