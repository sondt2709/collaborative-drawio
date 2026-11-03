import { DOMParser, XMLSerializer, type Document, type Element } from '@xmldom/xmldom';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../src/cli.js';
import type { IO } from '../src/commands/common.js';

export function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'dgm-test-'));
}

/** An empty user config folder, so a developer's own themes do not change the tests. */
const CONFIG = mkdtempSync(join(tmpdir(), 'dgm-config-'));

export interface Result {
  code: number;
  out: string;
  err: string;
}

export async function dgm(cwd: string, args: string[], stdin?: string, env: NodeJS.ProcessEnv = {}): Promise<Result> {
  const out: string[] = [];
  const err: string[] = [];
  const io: IO = {
    cwd,
    env: { PATH: process.env.PATH, DGM_CONFIG_DIR: CONFIG, DGM_NO_OPEN: '1', ...env },
    stdin: async () => stdin,
    out: (l) => out.push(l),
    err: (l) => err.push(l),
  };
  const code = await run(args, io);
  return { code, out: out.join('\n'), err: err.join('\n') };
}

export function write(dir: string, rel: string, text: string): string {
  const p = join(dir, rel);
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, text);
  return p;
}

export function read(dir: string, rel: string): string {
  return readFileSync(join(dir, rel), 'utf8');
}

/** All elements with an id. */
export function byId(root: Element, id: string): Element | undefined {
  const all = root.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) if (all[i].getAttribute('id') === id) return all[i];
  return undefined;
}

/** The mxCell of a cell id (inside an object or the element itself). */
export function mxCellOf(root: Element, id: string): Element {
  const el = byId(root, id)!;
  return el.tagName === 'mxCell' ? el : el.getElementsByTagName('mxCell')[0];
}

/**
 * Edit a file the way the draw.io desktop app saves it: compact XML, the app
 * adds host, agent and modified attributes, and new cells have generated ids.
 */
export function drawioSave(file: string, edit: (root: Element, doc: Document) => void): void {
  const dom = new DOMParser().parseFromString(readFileSync(file, 'utf8'), 'text/xml');
  const top = dom.documentElement!;
  top.setAttribute('host', 'Electron');
  top.setAttribute('agent', 'Mozilla/5.0 (Macintosh) draw.io/32.4.1 Electron');
  top.setAttribute('modified', '2026-01-01T00:00:00.000Z');
  edit(top, dom);
  let xml = new XMLSerializer().serializeToString(dom);
  xml = xml.replace(/>\s+</g, '><');
  writeFileSync(file, xml);
}

export function addRawCell(root: Element, doc: Document, id: string, value: string, geo = { x: 900, y: 40, w: 120, h: 60 }): void {
  const d = doc;
  const r = root.getElementsByTagName('root')[0];
  const c = d.createElement('mxCell');
  c.setAttribute('id', id);
  c.setAttribute('value', value);
  c.setAttribute('style', 'rounded=0;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;');
  c.setAttribute('vertex', '1');
  c.setAttribute('parent', '1');
  const g = d.createElement('mxGeometry');
  g.setAttribute('x', String(geo.x));
  g.setAttribute('y', String(geo.y));
  g.setAttribute('width', String(geo.w));
  g.setAttribute('height', String(geo.h));
  g.setAttribute('as', 'geometry');
  c.appendChild(g);
  r.appendChild(c);
}

export const SMALL = `title: Shop
nodes:
  api: {title: API gateway, icon: shield, tone: indigo}
  core:
    kind: zone
    title: Core
    tone: violet
    nodes:
      svc: {title: Order Service, sub: Creates orders, icon: server}
      pay: {title: Payment worker, icon: credit-card}
  db: {kind: cylinder, title: Postgres, icon: database}
edges:
  - "api -> svc": REST
  - svc -> db
`;
