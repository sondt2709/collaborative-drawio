import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { readView } from '../diagram.js';
import type { DrawioDoc } from '../model/doc.js';
import { styleMap } from '../model/style.js';
import { serializeOverride } from '../theme/render.js';

export interface SNode {
  parent: string;
  kind: string;
  tone?: string;
  icon?: string;
  variant?: string;
  style?: string;
  title: string;
  sub?: string;
  geo: [number, number, number, number];
  /** Style key -> short hash of the value. */
  s: Record<string, string>;
}

export interface SEdge {
  ref: string;
  from: string;
  to: string;
  label?: string;
  kind?: string;
  variant?: string;
  badge?: string;
  /** Waypoints, rounded. */
  pts?: Array<[number, number]>;
  /** Fixed ends: "exitX,exitY>entryX,entryY". */
  ends?: string;
  s: Record<string, string>;
}

export interface Snapshot {
  title?: string;
  subtitle?: string;
  nodes: Record<string, SNode>;
  edges: Record<string, SEdge>;
}

export interface LogEntry {
  id: string;
  actor: 'agent' | 'human';
  time: string;
  summary: string;
  snapshot: string;
}

/** Edge style keys that draw.io changes when a person drags an edge end. They are not reported. */
const ROUTING_KEYS = new Set(['exitX', 'exitY', 'exitDx', 'exitDy', 'exitPerimeter', 'entryX', 'entryY', 'entryDx', 'entryDy', 'entryPerimeter']);

function hashStyle(style: string, edge: boolean): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of styleMap(style)) {
    if (edge && ROUTING_KEYS.has(k)) continue;
    out[k] = createHash('sha1').update(v).digest('hex').slice(0, 8);
  }
  return out;
}

const round = (n: number) => Math.round(n);

export function snapshot(doc: DrawioDoc): Snapshot {
  const v = readView(doc);
  const snap: Snapshot = { nodes: {}, edges: {} };
  if (v.title !== undefined) snap.title = v.title;
  if (v.subtitle !== undefined) snap.subtitle = v.subtitle;
  for (const n of v.nodes) {
    const s: SNode = {
      parent: n.parent,
      kind: n.kind,
      title: n.title,
      geo: [round(n.geo.x), round(n.geo.y), round(n.geo.w), round(n.geo.h)],
      s: hashStyle(doc.style(n.cell), false),
    };
    if (n.tone) s.tone = n.tone;
    if (n.icon) s.icon = n.icon;
    if (n.variant) s.variant = n.variant;
    const st = serializeOverride(n.style);
    if (st) s.style = st;
    if (n.sub !== undefined) s.sub = n.sub;
    snap.nodes[n.id] = s;
  }
  for (const e of v.edges) {
    const s: SEdge = { ref: e.ref, from: e.from, to: e.to, s: hashStyle(doc.style(e.cell), true) };
    if (e.label) s.label = e.label;
    if (e.kind) s.kind = e.kind;
    if (e.variant) s.variant = e.variant;
    if (e.badge) s.badge = e.badge;
    if (e.points.length) s.pts = e.points.map(([x, y]) => [round(x), round(y)]);
    const ends = endsOf(doc.style(e.cell));
    if (ends) s.ends = ends;
    snap.edges[e.id] = s;
  }
  return snap;
}

// ---- diff -------------------------------------------------------------------

export interface Diff {
  lines: string[];
  added: number;
  removed: number;
  changed: number;
  moved: number;
}

const q = (s: string | undefined) => (s === undefined ? '(none)' : JSON.stringify(s));

function describeNode(n: SNode): string {
  const parts = [`kind: ${n.kind}`, `title: ${JSON.stringify(n.title)}`];
  if (n.sub) parts.push(`sub: ${JSON.stringify(n.sub)}`);
  if (n.parent !== 'page') parts.push(`in: ${n.parent}`);
  return `{${parts.join(', ')}}`;
}

function styleKeysChanged(a: Record<string, string>, b: Record<string, string>): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].filter((k) => a[k] !== b[k]).map((k) => k.replace(/^base:/, ''));
}

/** The changes from snapshot `a` to snapshot `b`, as short lines. */
export function diff(a: Snapshot, b: Snapshot): Diff {
  const d: Diff = { lines: [], added: 0, removed: 0, changed: 0, moved: 0 };
  const push = (l: string) => d.lines.push(l);
  if (a.title !== b.title) {
    push(`~ title ${q(a.title)} -> ${q(b.title)}`);
    d.changed++;
  }
  if (a.subtitle !== b.subtitle) {
    push(`~ subtitle ${q(a.subtitle)} -> ${q(b.subtitle)}`);
    d.changed++;
  }
  const moved: string[] = [];
  for (const [id, n] of Object.entries(b.nodes)) {
    const o = a.nodes[id];
    if (!o) {
      push(`+ ${id} ${describeNode(n)}`);
      d.added++;
      continue;
    }
    let changed = false;
    const field = (name: string, x: string | undefined, y: string | undefined) => {
      if (x !== y) {
        push(`~ ${id}.${name} ${q(x)} -> ${q(y)}`);
        changed = true;
      }
    };
    field('title', o.title, n.title);
    field('sub', o.sub, n.sub);
    field('kind', o.kind, n.kind);
    field('tone', o.tone, n.tone);
    field('icon', o.icon, n.icon);
    field('variant', o.variant, n.variant);
    field('style', o.style, n.style);
    if (o.parent !== n.parent) {
      push(`~ ${id}.in ${o.parent} -> ${n.parent}`);
      changed = true;
    }
    const keys = styleKeysChanged(o.s, n.s);
    if (keys.length && o.kind === n.kind) {
      push(`~ ${id} style: ${keys.join(', ')}`);
      changed = true;
    }
    if (changed) d.changed++;
    if (o.geo.some((v, i) => Math.abs(v - n.geo[i]) >= 1)) moved.push(id);
  }
  for (const [id, n] of Object.entries(a.nodes)) {
    if (!b.nodes[id]) {
      push(`- ${id} ${describeNode(n)}`);
      d.removed++;
    }
  }
  if (moved.length) {
    push(`~ moved or resized ${moved.length} node${moved.length > 1 ? 's' : ''}: ${moved.join(', ')}`);
    d.moved = moved.length;
  }
  for (const [id, e] of Object.entries(b.edges)) {
    const o = a.edges[id];
    if (!o) {
      push(`+ edge ${e.ref}${e.label ? ` ${JSON.stringify(e.label)}` : ''}`);
      d.added++;
      continue;
    }
    let changed = false;
    if (o.from !== e.from || o.to !== e.to) {
      push(`~ edge ${o.ref} now ${e.ref}`);
      changed = true;
    }
    const field = (name: string, x: string | undefined, y: string | undefined) => {
      if (x !== y) {
        push(`~ edge ${e.ref}.${name} ${q(x)} -> ${q(y)}`);
        changed = true;
      }
    };
    field('label', o.label, e.label);
    field('kind', o.kind, e.kind);
    field('variant', o.variant, e.variant);
    field('badge', o.badge, e.badge);
    if (o.from === e.from && o.to === e.to && (!samePts(o.pts, e.pts) || (o.ends ?? '') !== (e.ends ?? ''))) {
      push(`~ edge ${e.ref} route changed in draw.io`);
      changed = true;
    }
    const keys = styleKeysChanged(o.s, e.s);
    if (keys.length && o.kind === e.kind && o.variant === e.variant) {
      push(`~ edge ${e.ref} style: ${keys.join(', ')}`);
      changed = true;
    }
    if (changed) d.changed++;
  }
  for (const [id, e] of Object.entries(a.edges)) {
    if (!b.edges[id]) {
      push(`- edge ${e.ref}${e.label ? ` ${JSON.stringify(e.label)}` : ''}`);
      d.removed++;
    }
  }
  return d;
}

function samePts(a: Array<[number, number]> | undefined, b: Array<[number, number]> | undefined): boolean {
  const x = a ?? [];
  const y = b ?? [];
  return x.length === y.length && x.every((p, i) => Math.abs(p[0] - y[i][0]) <= 1 && Math.abs(p[1] - y[i][1]) <= 1);
}

/**
 * Edges whose points differ from the last agent snapshot: a person changed
 * their route. Returns edge id -> current points.
 */
export interface PersonRoute {
  points: Array<[number, number]>;
  exit?: [number, number];
  entry?: [number, number];
}

function endsOf(style: string): string | undefined {
  const m = styleMap(style);
  const v = (k: string) => m.get(k);
  const ex = v('exitX') !== undefined ? `${v('exitX')},${v('exitY')}` : '';
  const en = v('entryX') !== undefined ? `${v('entryX')},${v('entryY')}` : '';
  return ex || en ? `${ex}>${en}` : undefined;
}

export function personRoutes(file: string, doc: DrawioDoc): Map<string, PersonRoute> {
  const out = new Map<string, PersonRoute>();
  const last = lastSnapshot(file, 'agent');
  if (!last) return out;
  for (const e of readView(doc).edges) {
    const o = last.edges[e.id];
    if (!o || o.from !== e.from || o.to !== e.to) continue;
    const pts = e.points.map(([x, y]) => [round(x), round(y)] as [number, number]);
    const ends = endsOf(doc.style(e.cell));
    if (samePts(o.pts, pts) && (o.ends ?? '') === (ends ?? '')) continue;
    const m = styleMap(doc.style(e.cell));
    const pair = (a: string, b: string): [number, number] | undefined =>
      m.get(a) !== undefined && m.get(b) !== undefined ? [Number(m.get(a)), Number(m.get(b))] : undefined;
    out.set(e.id, { points: e.points, exit: pair('exitX', 'exitY'), entry: pair('entryX', 'entryY') });
  }
  return out;
}

export function summarize(d: Diff): string {
  const parts: string[] = [];
  if (d.added) parts.push(`${d.added} added`);
  if (d.removed) parts.push(`${d.removed} removed`);
  if (d.changed) parts.push(`${d.changed} changed`);
  if (d.moved) parts.push(`${d.moved} moved or resized`);
  return parts.join(', ') || 'no change';
}

// ---- history files ------------------------------------------------------------

/** The history folder of a diagram: .dgm/<file-name>/ next to the file. */
export function historyDir(file: string): string {
  return join(dirname(file), '.dgm', basename(file));
}

export function readLog(file: string): LogEntry[] {
  const p = join(historyDir(file), 'log.jsonl');
  if (!existsSync(p)) return [];
  const out: LogEntry[] = [];
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as LogEntry);
    } catch {
      // Skip a broken line.
    }
  }
  return out;
}

export function isTracked(file: string): boolean {
  return readLog(file).length > 0;
}

export function readSnapshot(file: string, entry: LogEntry): Snapshot | undefined {
  const p = join(historyDir(file), 'snapshots', entry.snapshot);
  if (!existsSync(p)) return undefined;
  return JSON.parse(readFileSync(p, 'utf8')) as Snapshot;
}

export function lastSnapshot(file: string, actor?: 'agent' | 'human'): Snapshot | undefined {
  const log = readLog(file).filter((e) => !actor || e.actor === actor);
  for (let i = log.length - 1; i >= 0; i--) {
    const s = readSnapshot(file, log[i]);
    if (s) return s;
  }
  return undefined;
}

function now(): string {
  return new Date().toISOString();
}

export function record(file: string, actor: 'agent' | 'human', snap: Snapshot, summary: string): LogEntry {
  const dir = historyDir(file);
  mkdirSync(join(dir, 'snapshots'), { recursive: true });
  const log = readLog(file);
  const n = log.length + 1;
  const turn = log.filter((e) => e.actor === 'agent').length + 1;
  const name = `${String(n).padStart(4, '0')}.json`;
  writeFileSync(join(dir, 'snapshots', name), `${JSON.stringify(snap)}\n`);
  const entry: LogEntry = { id: actor === 'agent' ? `turn-${turn}` : 'human', actor, time: now(), summary, snapshot: name };
  appendFileSync(join(dir, 'log.jsonl'), `${JSON.stringify(entry)}\n`);
  return entry;
}

/** The changes since the last snapshot, or undefined when the file is not tracked. */
export function pending(file: string, doc: DrawioDoc): { diff: Diff; snap: Snapshot } | undefined {
  const last = lastSnapshot(file);
  if (!last) return undefined;
  const snap = snapshot(doc);
  return { diff: diff(last, snap), snap };
}

/** Record the changes of a person as one human entry. Returns the diff, or undefined when nothing changed. */
export function ackHuman(file: string, doc: DrawioDoc): Diff | undefined {
  const p = pending(file, doc);
  if (!p || !p.diff.lines.length) return undefined;
  record(file, 'human', p.snap, summarize(p.diff));
  return p.diff;
}

/**
 * The position where dgm last placed each node. Agent entries place a node
 * when it is new or its position changed since the previous entry. Human
 * entries place nothing, so a person's move never counts as a dgm placement.
 */
export function agentPlacements(file: string): Map<string, [number, number]> {
  const placed = new Map<string, [number, number]>();
  let prev: Snapshot | undefined;
  for (const e of readLog(file)) {
    const snap = readSnapshot(file, e);
    if (!snap) continue;
    if (e.actor === 'agent') {
      for (const [id, n] of Object.entries(snap.nodes)) {
        const o = prev?.nodes[id];
        if (!o || o.geo[0] !== n.geo[0] || o.geo[1] !== n.geo[1]) placed.set(id, [n.geo[0], n.geo[1]]);
      }
    }
    prev = snap;
  }
  return placed;
}
