import { createRequire } from 'node:module';
import type { ELK as ElkApi } from 'elkjs/lib/elk-api.js';
import type { Geometry } from '../model/doc.js';
import type { StyleOverride } from '../theme/render.js';
import type { NodeKind, Theme } from '../theme/theme.js';
import { lineCount, textWidth } from './text.js';

export interface LNode {
  id: string;
  kind: NodeKind | 'raw';
  title: string;
  sub?: string;
  icon?: string;
  style?: StyleOverride;
  /** Keep this position (relative to the parent). */
  at?: [number, number];
  /** Keep this size (cells that dgm does not style, or nodes a person resized). */
  size?: [number, number];
  children: LNode[];
}

export interface LEdge {
  from: string;
  to: string;
}

export interface LayoutInput {
  title?: string;
  subtitle?: string;
  direction: 'down' | 'right';
  nodes: LNode[];
  edges: LEdge[];
}

export interface LayoutResult {
  /** Geometry of each node, relative to its parent. */
  geo: Map<string, Geometry>;
  title?: Geometry;
  subtitle?: Geometry;
}

const r = Math.round;

/** The size of a leaf node (not a zone). */
export function leafSize(theme: Theme, n: LNode): [number, number] {
  if (n.size) return n.size;
  const s = theme.sizes;
  const o = n.style ?? {};
  let w: number;
  let h: number;
  switch (n.kind) {
    case 'card': {
      const left = n.icon ? 50 : 14;
      const need = left + Math.max(textWidth(n.title, s.card.fontSize, true), n.sub ? textWidth(n.sub, s.card.subFontSize) : 0) + 12;
      w = o.width ?? Math.min(s.card.maxWidth, Math.max(s.card.width, s.card.minWidth, need));
      if (n.sub) {
        const lines = lineCount(n.sub, s.card.subFontSize, w - left - 8);
        h = Math.max(s.card.height, 30 + lines * 15 + 12);
      } else h = s.card.compactHeight;
      break;
    }
    case 'cylinder': {
      w = o.width ?? Math.max(s.cylinder.width, textWidth(n.title, s.cylinder.fontSize, true) + 32);
      const lines = n.sub ? lineCount(n.sub, s.cylinder.subFontSize, w - 20) : 0;
      h = Math.max(s.cylinder.height - (n.icon ? 0 : 24) - (n.sub ? 0 : 30), (n.icon ? 88 : 64) + lines * 15 + 22);
      break;
    }
    case 'chip':
      w = textWidth(n.title, s.chip.fontSize, true) + 2 * s.chip.padding + (n.icon ? 22 : 0);
      h = s.chip.height;
      break;
    case 'note': {
      const max = s.zone.maxWidth - 2 * s.zone.padding;
      w = Math.min(max, textWidth(n.title, s.note.fontSize) + 6);
      h = s.note.height + (lineCount(n.title, s.note.fontSize, w) - 1) * 15;
      break;
    }
    case 'text':
      w = textWidth(n.title, s.text.fontSize) + 6;
      h = s.text.height + (n.title.split('\n').length - 1) * 18;
      break;
    case 'band':
      w = textWidth(n.title, s.band.fontSize, true) + (n.icon ? 40 : 14) + 14;
      h = s.band.height;
      break;
    default:
      w = 120;
      h = 60;
  }
  return [r(o.width ?? w), r(o.height ?? h)];
}

interface Sized {
  w: number;
  h: number;
}

/**
 * Size a node. For a zone, place its children in rows (YAML order). A row
 * wraps at the zone maximum width, and a new row starts when the kind changes
 * or at a note. Writes child geometry into `geo`.
 */
export function sizeNode(theme: Theme, n: LNode, geo: Map<string, Geometry>): Sized {
  if (n.kind !== 'zone' || n.size) {
    const [w, h] = n.kind === 'zone' ? n.size! : leafSize(theme, n);
    if (n.kind === 'zone') for (const c of n.children) sizeNode(theme, c, geo);
    return { w, h };
  }
  const z = theme.sizes.zone;
  const inner = z.maxWidth - 2 * z.padding;
  let x = z.padding;
  let y = z.header;
  let rowH = 0;
  let prev: string | undefined;
  let right = 0;
  let bottom = z.header;
  const flow: LNode[] = [];
  const bands: LNode[] = [];
  for (const c of n.children) {
    const s = sizeNode(theme, c, geo);
    if (c.at) {
      geo.set(c.id, { x: c.at[0], y: c.at[1], w: s.w, h: s.h });
      right = Math.max(right, c.at[0] + s.w);
      bottom = Math.max(bottom, c.at[1] + s.h);
      continue;
    }
    const breakRow =
      x > z.padding && (x + s.w > z.padding + inner || c.kind !== prev || c.kind === 'note' || prev === 'note' || c.kind === 'band' || prev === 'band');
    if (breakRow) {
      x = z.padding;
      y += rowH + z.gap;
      rowH = 0;
    }
    geo.set(c.id, { x, y, w: s.w, h: s.h });
    if (c.kind === 'band' && !c.style?.width) bands.push(c);
    flow.push(c);
    x += s.w + z.gap;
    rowH = Math.max(rowH, s.h);
    right = Math.max(right, x - z.gap);
    bottom = Math.max(bottom, y + rowH);
    prev = c.kind;
  }
  const titleW = textWidth(n.title, z.fontSize, true) + (n.icon ? 38 : 16) + 16;
  let w = Math.max(z.minWidth, right + z.padding, titleW);
  if (n.style?.width) w = n.style.width;
  // A band in a zone spans the zone.
  for (const b of bands) {
    const g = geo.get(b.id)!;
    g.w = Math.max(g.w, w - 2 * z.padding);
  }
  let h = flow.length || n.children.length ? bottom + z.padding : z.header + 40;
  if (n.style?.height) h = n.style.height;
  return { w: r(w), h: r(h) };
}

/** The top-level node that contains `id`. */
function topOf(id: string, parent: Map<string, string>): string {
  let cur = id;
  for (let i = 0; i < 100; i++) {
    const p = parent.get(cur);
    if (!p || p === 'page') return cur;
    cur = p;
  }
  return cur;
}

// elkjs (EPL-2.0) is a CommonJS module.
const ELK = createRequire(import.meta.url)('elkjs/lib/elk.bundled.js') as new () => ElkApi;
const elk = new ELK();

async function elkLayout(theme: Theme, direction: 'down' | 'right', nodes: Array<{ id: string; w: number; h: number }>, edges: Array<{ from: string; to: string }>) {
  const p = theme.sizes.page;
  const graph = await elk.layout({
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction === 'right' ? 'RIGHT' : 'DOWN',
      'elk.spacing.nodeNode': String(p.nodeGap),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(p.layerGap),
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.padding': '[top=0,left=0,bottom=0,right=0]',
      'elk.randomSeed': '1',
    },
    children: nodes.map((n) => ({ id: n.id, width: n.w, height: n.h })),
    edges: edges.map((e, i) => ({ id: `e${i}`, sources: [e.from], targets: [e.to] })),
  });
  const out = new Map<string, { x: number; y: number }>();
  for (const c of graph.children ?? []) out.set(c.id, { x: r(c.x ?? 0), y: r(c.y ?? 0) });
  return out;
}

/**
 * Lay out one page segment. Each connected group gets a layered layout. The
 * groups are packed in rows (direction down) or in one column (direction right),
 * in YAML order.
 */
async function layered(theme: Theme, direction: 'down' | 'right', nodes: Array<{ id: string; w: number; h: number }>, edges: LEdge[]) {
  const p = theme.sizes.page;
  const ids = new Set(nodes.map((n) => n.id));
  const seen = new Set<string>();
  const links: LEdge[] = [];
  for (const e of edges) {
    if (e.from === e.to || !ids.has(e.from) || !ids.has(e.to)) continue;
    const k = `${e.from}\u0000${e.to}`;
    if (seen.has(k)) continue;
    seen.add(k);
    links.push(e);
  }
  // Connected groups (union-find), in YAML order of their first node.
  const root = new Map(nodes.map((n) => [n.id, n.id]));
  const find = (x: string): string => {
    let c = x;
    while (root.get(c) !== c) c = root.get(c)!;
    root.set(x, c);
    return c;
  };
  for (const e of links) root.set(find(e.from), find(e.to));
  const groups = new Map<string, Array<{ id: string; w: number; h: number }>>();
  for (const n of nodes) {
    const g = find(n.id);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(n);
  }
  const out = new Map<string, { x: number; y: number }>();
  const maxW = p.maxWidth ?? 1200;
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const members of groups.values()) {
    const memberIds = new Set(members.map((m) => m.id));
    const pos =
      members.length === 1
        ? new Map([[members[0].id, { x: 0, y: 0 }]])
        : await elkLayout(theme, direction, members, links.filter((e) => memberIds.has(e.from)));
    let w = 0;
    let h = 0;
    for (const m of members) {
      const v = pos.get(m.id)!;
      w = Math.max(w, v.x + m.w);
      h = Math.max(h, v.y + m.h);
    }
    if (direction === 'right') {
      for (const m of members) out.set(m.id, { x: pos.get(m.id)!.x, y: y + pos.get(m.id)!.y });
      y += h + p.gap;
      continue;
    }
    if (x > 0 && x + w > maxW) {
      x = 0;
      y += rowH + p.gap;
      rowH = 0;
    }
    for (const m of members) out.set(m.id, { x: x + pos.get(m.id)!.x, y: y + pos.get(m.id)!.y });
    x += w + p.gap;
    rowH = Math.max(rowH, h);
  }
  return out;
}

/** Place all nodes with the create rules. */
export async function layoutDiagram(theme: Theme, input: LayoutInput): Promise<LayoutResult> {
  const p = theme.sizes.page;
  const geo = new Map<string, Geometry>();
  const parent = new Map<string, string>();
  const walk = (ns: LNode[], par: string) => {
    for (const n of ns) {
      parent.set(n.id, par);
      walk(n.children, n.id);
    }
  };
  walk(input.nodes, 'page');

  const sizes = new Map<string, Sized>();
  for (const n of input.nodes) sizes.set(n.id, sizeNode(theme, n, geo));

  const ts = theme.sizes.title;
  const res: LayoutResult = { geo };
  let top = p.margin;
  if (input.title) {
    res.title = { x: p.margin, y: 30, w: 0, h: r(ts.fontSize * 1.4) };
    top = 30 + res.title.h + 8;
  }
  if (input.subtitle) {
    res.subtitle = { x: p.margin, y: top - (input.title ? 4 : 0), w: 0, h: r(ts.subFontSize * 1.6) };
    top = res.subtitle.y + res.subtitle.h + 4;
  }
  if (input.title || input.subtitle) top += 24;

  // Lift edges to their top-level nodes.
  const lifted = input.edges.map((e) => ({ from: topOf(e.from, parent), to: topOf(e.to, parent) }));

  // Split the page into segments at top-level bands.
  type Seg = { band?: LNode; nodes: LNode[] };
  const segs: Seg[] = [];
  let cur: Seg = { nodes: [] };
  for (const n of input.nodes) {
    if (n.at) {
      const s = sizes.get(n.id)!;
      geo.set(n.id, { x: n.at[0], y: n.at[1], w: s.w, h: s.h });
      continue;
    }
    if (n.kind === 'band') {
      if (cur.nodes.length) segs.push(cur);
      segs.push({ band: n, nodes: [] });
      cur = { nodes: [] };
    } else cur.nodes.push(n);
  }
  if (cur.nodes.length) segs.push(cur);

  let y = top;
  let contentW = 0;
  const bands: LNode[] = [];
  for (const seg of segs) {
    if (seg.band) {
      const s = sizes.get(seg.band.id)!;
      geo.set(seg.band.id, { x: p.margin, y, w: s.w, h: s.h });
      if (!seg.band.style?.width) bands.push(seg.band);
      contentW = Math.max(contentW, s.w);
      y += s.h + p.gap / 2;
      continue;
    }
    const pos = await layered(
      theme,
      input.direction,
      seg.nodes.map((n) => ({ id: n.id, ...sizes.get(n.id)! })),
      lifted,
    );
    let minX = Infinity;
    let minY = Infinity;
    for (const v of pos.values()) {
      minX = Math.min(minX, v.x);
      minY = Math.min(minY, v.y);
    }
    let segH = 0;
    for (const n of seg.nodes) {
      const s = sizes.get(n.id)!;
      const v = pos.get(n.id)!;
      const g = { x: p.margin + v.x - minX, y: y + v.y - minY, w: s.w, h: s.h };
      geo.set(n.id, g);
      segH = Math.max(segH, g.y + g.h - y);
      contentW = Math.max(contentW, g.x + g.w - p.margin);
    }
    y += segH + p.gap / 2;
  }
  for (const b of bands) geo.get(b.id)!.w = Math.max(geo.get(b.id)!.w, contentW);
  if (res.title) res.title.w = r(Math.max(contentW, textWidth(input.title!, ts.fontSize, true) + 8));
  if (res.subtitle) res.subtitle.w = r(Math.max(contentW, Math.min(1000, textWidth(input.subtitle!, ts.subFontSize) + 8)));
  if (res.subtitle && textWidth(input.subtitle!, ts.subFontSize) + 8 > res.subtitle.w) {
    res.subtitle.h = r(lineCount(input.subtitle!, ts.subFontSize, res.subtitle.w) * ts.subFontSize * 1.4 + 4);
  }
  return res;
}

// ---- placement of new nodes (apply) ---------------------------------------

export interface Box extends Geometry {
  id: string;
  kind?: string;
}

export function overlap(a: Geometry, b: Geometry, gap = 0): boolean {
  return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
}

/** The next free position in the row flow of a zone. */
export function placeInZone(theme: Theme, zone: Geometry, children: Box[], size: Sized, kind: string): { x: number; y: number } {
  const z = theme.sizes.zone;
  const inner = Math.max(zone.w, z.maxWidth) - 2 * z.padding;
  if (!children.length) return { x: z.padding, y: z.header };
  // Rows by top position, from the last row to the first. A new node goes to
  // the end of the lowest row of the same kind that has room.
  const tops = [...new Set(children.map((c) => Math.round(c.y)))].sort((a, b) => b - a);
  if (kind !== 'note' && kind !== 'band') {
    for (const top of tops) {
      const row = children.filter((c) => Math.abs(c.y - top) < 8);
      const last = row.reduce((a, b) => (b.x + b.w > a.x + a.w ? b : a));
      if (last.kind !== kind) continue;
      const x = last.x + last.w + z.gap;
      if (x + size.w > z.padding + inner) continue;
      const cand = { x, y: last.y, w: size.w, h: size.h };
      if (!children.some((c) => overlap(cand, c))) return { x, y: last.y };
    }
  }
  const bottom = Math.max(...children.map((c) => c.y + c.h));
  return { x: z.padding, y: bottom + z.gap };
}

/** The first free position next to `near`, in the document direction. */
export function placeNear(theme: Theme, near: Geometry, siblings: Box[], size: Sized, direction: 'down' | 'right'): { x: number; y: number } {
  const gap = theme.sizes.page.nodeGap;
  const cand = direction === 'right' ? { x: near.x + near.w + gap, y: near.y, ...size } : { x: near.x, y: near.y + near.h + gap, ...size };
  for (let i = 0; i < 200; i++) {
    const hit = siblings.find((s) => overlap(cand, s, gap / 2 - 1));
    if (!hit) break;
    if (direction === 'right') cand.x = hit.x + hit.w + gap;
    else cand.y = hit.y + hit.h + gap;
  }
  return { x: r(cand.x), y: r(cand.y) };
}

/** Below all content of the page. */
export function placeBelow(theme: Theme, siblings: Box[]): { x: number; y: number } {
  const p = theme.sizes.page;
  if (!siblings.length) return { x: p.margin, y: p.margin };
  return { x: r(Math.min(...siblings.map((s) => s.x))), y: r(Math.max(...siblings.map((s) => s.y + s.h)) + p.gap) };
}
