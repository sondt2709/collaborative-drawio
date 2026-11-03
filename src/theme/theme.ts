import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parse } from 'yaml';
import { DgmError } from '../errors.js';
import { PACKAGE_ROOT, userConfigDir } from '../paths.js';
import type { LD } from './color.js';

export interface Tone {
  accent: LD;
  tint: LD;
  solid: LD;
}

export interface EdgeKind {
  tone: string;
  width: number;
  dashed?: boolean;
  bold?: boolean;
}

export interface Theme {
  name: string;
  /** The file that the theme came from. */
  source: string;
  font: string;
  page: { background: LD };
  colors: { ink: LD; muted: LD; surface: LD; onSolid: LD; onAccent: LD };
  defaultTone: string;
  tones: Record<string, Tone>;
  sizes: {
    title: { fontSize: number; subFontSize: number };
    card: { width: number; minWidth: number; maxWidth: number; height: number; compactHeight: number; fontSize: number; subFontSize: number };
    chip: { height: number; padding: number; fontSize: number };
    note: { height: number; fontSize: number };
    text: { height: number; fontSize: number };
    band: { height: number; fontSize: number };
    cylinder: { width: number; height: number; fontSize: number; subFontSize: number };
    zone: { padding: number; header: number; gap: number; maxWidth: number; minWidth: number; fontSize: number };
    page: { margin: number; gap: number; layerGap: number; nodeGap: number; maxWidth?: number };
  };
  edges: Record<string, EdgeKind>;
}

export const NODE_KINDS = ['card', 'zone', 'chip', 'band', 'note', 'cylinder', 'text'] as const;
export type NodeKind = (typeof NODE_KINDS)[number];
export const VARIANTS = ['dashed', 'muted', 'emphasis'] as const;
export const SEMANTIC_COLORS = ['accent', 'tint', 'surface', 'ink', 'muted'] as const;

/** Theme files in lookup order: next to the diagram, the user config folder, the package. */
export function themeCandidates(name: string, diagramDir: string, env: NodeJS.ProcessEnv = process.env): string[] {
  return [
    join(diagramDir, '.dgm', 'themes', `${name}.yaml`),
    join(userConfigDir(env), 'themes', `${name}.yaml`),
    join(PACKAGE_ROOT, 'themes', `${name}.yaml`),
  ];
}

function merge(base: unknown, over: unknown): unknown {
  if (Array.isArray(over) || typeof over !== 'object' || over === null) return over === undefined ? base : over;
  if (typeof base !== 'object' || base === null || Array.isArray(base)) return over;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over)) out[k] = merge(out[k], v);
  return out;
}

function readTheme(file: string, name: string, diagramDir: string, env: NodeJS.ProcessEnv, depth: number): Record<string, unknown> {
  let data: unknown;
  try {
    data = parse(readFileSync(file, 'utf8'));
  } catch (e) {
    throw new DgmError(`theme ${file}: ${(e as Error).message.split('\n')[0]}`);
  }
  if (typeof data !== 'object' || data === null) throw new DgmError(`theme ${file}: not a YAML map`);
  const obj = data as Record<string, unknown>;
  const ext = obj.extends;
  if (typeof ext === 'string' && depth < 4) {
    // A theme can extend another theme. "extends: pro" in pro.yaml means the next file in the lookup order.
    const candidates = themeCandidates(ext, diagramDir, env).filter((f) => existsSync(f));
    const next = ext === name ? candidates[candidates.indexOf(file) + 1] : candidates[0];
    if (!next) throw new DgmError(`theme ${file}: extends unknown theme "${ext}"`);
    return merge(readTheme(next, ext, diagramDir, env, depth + 1), obj) as Record<string, unknown>;
  }
  return obj;
}

const cache = new Map<string, Theme>();

export function loadTheme(name: string, diagramFile: string, env: NodeJS.ProcessEnv = process.env): Theme {
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(name)) throw new DgmError(`invalid theme name "${name}"`);
  const dir = dirname(diagramFile);
  const file = themeCandidates(name, dir, env).find((f) => existsSync(f));
  if (!file) throw new DgmError(`theme "${name}" not found. Looked in .dgm/themes/, ${join(userConfigDir(env), 'themes')} and the package.`);
  const cached = cache.get(file);
  if (cached) return cached;
  const raw = readTheme(file, name, dir, env, 0);
  const theme = { ...(raw as unknown as Theme), name, source: file };
  validateTheme(theme, file);
  cache.set(file, theme);
  return theme;
}

export function clearThemeCache(): void {
  cache.clear();
}

function isLD(v: unknown): v is LD {
  return Array.isArray(v) && v.length === 2 && v.every((c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c));
}

function validateTheme(t: Theme, file: string): void {
  const bad = (m: string) => {
    throw new DgmError(`theme ${file}: ${m}`);
  };
  if (!t.tones || typeof t.tones !== 'object') bad('tones is missing');
  for (const [k, tone] of Object.entries(t.tones)) {
    for (const part of ['accent', 'tint', 'solid'] as const) {
      if (!isLD(tone?.[part])) bad(`tones.${k}.${part} must be ["#RRGGBB", "#RRGGBB"]`);
    }
  }
  for (const c of ['ink', 'muted', 'surface', 'onSolid', 'onAccent'] as const) {
    if (!isLD(t.colors?.[c])) bad(`colors.${c} must be ["#RRGGBB", "#RRGGBB"]`);
  }
  if (!isLD(t.page?.background)) bad('page.background must be ["#RRGGBB", "#RRGGBB"]');
  if (!t.tones[t.defaultTone]) bad(`defaultTone "${t.defaultTone}" is not a tone`);
  if (!t.edges?.default) bad('edges.default is missing');
  for (const [k, e] of Object.entries(t.edges)) if (!t.tones[e.tone]) bad(`edges.${k}.tone "${e.tone}" is not a tone`);
  if (!t.sizes?.card || !t.sizes?.zone || !t.sizes?.page) bad('sizes is incomplete');
}
