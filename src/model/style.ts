/**
 * draw.io style strings: "base;key=value;key2=value2;".
 * A token without "=" is a base style name, for example "text" or "ellipse".
 */
export type StyleEntry = [key: string, value: string | null];

export function parseStyle(style: string | null | undefined): StyleEntry[] {
  if (!style) return [];
  const out: StyleEntry[] = [];
  for (const token of style.split(';')) {
    if (!token) continue;
    const i = token.indexOf('=');
    if (i < 0) out.push([token, null]);
    else out.push([token.slice(0, i), token.slice(i + 1)]);
  }
  return out;
}

export function styleMap(style: string | null | undefined): Map<string, string> {
  const m = new Map<string, string>();
  for (const [k, v] of parseStyle(style)) m.set(v === null ? `base:${k}` : k, v ?? '');
  return m;
}

export function getStyle(style: string | null | undefined, key: string): string | undefined {
  for (const [k, v] of parseStyle(style)) if (k === key && v !== null) return v;
  return undefined;
}

export function hasBase(style: string | null | undefined, base: string): boolean {
  return parseStyle(style).some(([k, v]) => v === null && k === base);
}

/** Build a style string from an ordered list. Undefined values are left out. */
export function buildStyle(parts: Array<[string, string | number | undefined | null] | string>): string {
  let s = '';
  for (const p of parts) {
    if (typeof p === 'string') {
      s += `${p};`;
      continue;
    }
    const [k, v] = p;
    if (v === undefined || v === null) continue;
    s += `${k}=${v};`;
  }
  return s;
}
