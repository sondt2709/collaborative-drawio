import { createRequire } from 'node:module';
import { compressStencil, iconToStencilXml, type IconNode } from './stencil.js';

const require = createRequire(import.meta.url);
// lucide (ISC license): icon data only.
const lucide = require('lucide') as { icons: Record<string, IconNode> };

/** Normalized key ("arrowright") -> Lucide export name ("ArrowRight"). */
let index: Map<string, string> | undefined;
let names: string[] | undefined;

function key(name: string): string {
  return name.replace(/[-_\s]/g, '').toLowerCase();
}

function toKebab(pascal: string): string {
  return pascal
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .replace(/([a-zA-Z])(\d)/g, '$1-$2')
    .toLowerCase();
}

function load(): Map<string, string> {
  if (!index) {
    index = new Map();
    for (const k of Object.keys(lucide.icons)) index.set(key(k), k);
    names = [...new Set(Object.keys(lucide.icons).map(toKebab))].sort();
  }
  return index;
}

export function iconNames(): string[] {
  load();
  return names!;
}

export function iconExists(name: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) && load().has(key(name));
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** Up to `max` icon names near `name`. */
export function suggestIcons(name: string, max = 3): string[] {
  const n = name.toLowerCase();
  return iconNames()
    .map((c) => ({ c, d: levenshtein(n, c) - (c.startsWith(n) || n.startsWith(c) ? 1 : 0) }))
    .filter((x) => x.d <= Math.max(2, Math.floor(n.length / 3)))
    .sort((a, b) => a.d - b.d || a.c.length - b.c.length || a.c.localeCompare(b.c))
    .slice(0, max)
    .map((x) => x.c);
}

const stencils = new Map<string, string>();

/** The draw.io shape value for an icon: "stencil(<data>)". */
export function iconStencil(name: string): string {
  const cached = stencils.get(name);
  if (cached) return cached;
  const k = load().get(key(name));
  if (!k) throw new Error(`unknown icon "${name}"`);
  const value = `stencil(${compressStencil(iconToStencilXml(lucide.icons[k]))})`;
  stencils.set(name, value);
  return value;
}
