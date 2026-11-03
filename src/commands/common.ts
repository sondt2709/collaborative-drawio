import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { readView, type DiagramView } from '../diagram.js';
import type { NodeSpec } from '../dsl/parse.js';
import { DgmError } from '../errors.js';
import type { LNode } from '../layout/layout.js';
import { DrawioDoc } from '../model/doc.js';
import { loadTheme, type Theme } from '../theme/theme.js';

export interface IO {
  cwd: string;
  env: NodeJS.ProcessEnv;
  /** Read all of standard input. Undefined when standard input is a terminal. */
  stdin: () => Promise<string | undefined>;
  out: (line: string) => void;
  err: (line: string) => void;
}

export function abs(io: IO, file: string): string {
  return resolve(io.cwd, file);
}

/** YAML from --from <file> or from standard input. */
export async function readInput(io: IO, from: string | undefined): Promise<string> {
  if (from) {
    const p = abs(io, from);
    if (!existsSync(p)) throw new DgmError(`${from} does not exist`);
    return readFileSync(p, 'utf8');
  }
  const text = await io.stdin();
  if (text === undefined || !text.trim()) throw new DgmError('send YAML on standard input, or use --from <yaml-file>');
  return text;
}

export interface Loaded {
  path: string;
  doc: DrawioDoc;
  view: DiagramView;
  theme: Theme;
}

export function loadDiagram(io: IO, file: string): Loaded {
  const path = abs(io, file);
  if (!existsSync(path)) throw new DgmError(`${file} does not exist`);
  const doc = DrawioDoc.parse(readFileSync(path, 'utf8'), file);
  const view = readView(doc);
  const theme = loadTheme(view.theme, path, io.env);
  return { path, doc, view, theme };
}

export function writeDoc(path: string, doc: DrawioDoc): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, doc.serialize());
}

export function specToLNode(n: NodeSpec): LNode {
  return {
    id: n.id,
    kind: n.kind,
    title: n.title,
    sub: n.sub,
    icon: n.icon,
    style: n.style,
    at: n.at,
    children: n.children.map(specToLNode),
  };
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
