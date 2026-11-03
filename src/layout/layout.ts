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
  /** Rows of child ids; an item that is a list is a column. */
  rows?: RowItem[][];
  /** Set by the layout: the size and the child geometry are done. */
  laid?: boolean;
  children: LNode[];
}

export type RowItem = string | string[];

export interface LEdge {
  from: string;
  to: string;
  /** false: the edge does not affect the placement. */
  layout?: boolean;
}

export interface LayoutInput {
  title?: string;
  subtitle?: string;
  direction: 'down' | 'right';
  nodes: LNode[];
  edges: LEdge[];
  /** Rows of top-level ids. */
  rows?: RowItem[][];
  /** Page width for wrapping; default: the theme value. */
  width?: number;
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

const DECO = new Set(['chip', 'note', 'text', 'band']);

/**
 * Place children in rows (YAML order), relative to (0, 0). A row wraps at
 * `inner` px, and a new row starts when the kind changes or at a note or a
 * band. Writes child geometry into `geo`.
 */
function flowRows(theme: Theme, kids: LNode[], geo: Map<string, Geometry>, inner: number): Sized & { bands: LNode[] } {
  const gap = theme.sizes.zone.gap;
  let x = 0;
  let y = 0;
  let rowH = 0;
  let prev: string | undefined;
  let right = 0;
  let bottom = 0;
  const bands: LNode[] = [];
  for (const c of kids) {
    const s = sizeNode(theme, c, geo);
    const breakRow = x > 0 && (x + s.w > inner || c.kind !== prev || c.kind === 'note' || prev === 'note' || c.kind === 'band' || prev === 'band');
    if (breakRow) {
      x = 0;
      y += rowH + gap;
      rowH = 0;
    }
    geo.set(c.id, { x, y, w: s.w, h: s.h });
    if (c.kind === 'band' && !c.style?.width) bands.push(c);
    x += s.w + gap;
    rowH = Math.max(rowH, s.h);
    right = Math.max(right, x - gap);
    bottom = Math.max(bottom, y + rowH);
    prev = c.kind;
  }
  return { w: right, h: bottom, bands };
}

function zoneTitleWidth(theme: Theme, n: LNode): number {
  return textWidth(n.title, theme.sizes.zone.fontSize, true) + (n.icon ? 38 : 16) + 16;
}

/**
 * Size a node. For a zone, place its children in rows (YAML order). Writes
 * child geometry into `geo`.
 */
export function sizeNode(theme: Theme, n: LNode, geo: Map<string, Geometry>): Sized {
  if (n.laid && n.size) return { w: n.size[0], h: n.size[1] };
  if (n.kind !== 'zone' || n.size) {
    const [w, h] = n.kind === 'zone' ? n.size! : leafSize(theme, n);
    if (n.kind === 'zone') for (const c of n.children) sizeNode(theme, c, geo);
    return { w, h };
  }
  const z = theme.sizes.zone;
  const flowKids = n.children.filter((c) => !c.at);
  const rows = flowRows(theme, flowKids, geo, z.maxWidth - 2 * z.padding);
  let right = rows.w + z.padding;
  let bottom = z.header + rows.h;
  for (const c of flowKids) {
    const g = geo.get(c.id)!;
    g.x += z.padding;
    g.y += z.header;
  }
  for (const c of n.children) {
    if (!c.at) continue;
    const s = sizeNode(theme, c, geo);
    geo.set(c.id, { x: c.at[0], y: c.at[1], w: s.w, h: s.h });
    right = Math.max(right, c.at[0] + s.w);
    bottom = Math.max(bottom, c.at[1] + s.h);
  }
  let w = Math.max(z.minWidth, right + z.padding, zoneTitleWidth(theme, n));
  if (n.style?.width) w = n.style.width;
  // A band in a zone spans the zone.
  for (const b of rows.bands) {
    const g = geo.get(b.id)!;
    g.w = Math.max(g.w, w - 2 * z.padding);
  }
  let h = n.children.length ? bottom + z.padding : z.header + 40;
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

interface ElkIn {
  id: string;
  width?: number;
  height?: number;
  layoutOptions?: Record<string, string>;
  children?: ElkIn[];
}

interface ElkOut {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  children?: ElkOut[];
}

/** Shared state of one layout run. */
class Ctx {
  /** Edge endpoints (node ids). */
  endpoints = new Set<string>();
  parent = new Map<string, string>();
  /** Rows of the non-graph children of each compound zone. */
  rows = new Map<string, { size: Sized; kids: LNode[]; bands: LNode[]; at: LNode[] }>();
  compound = new Set<string>();
  /** Edges that affect the placement. */
  edges: LEdge[] = [];
  constructor(
    readonly theme: Theme,
    readonly geo: Map<string, Geometry>,
    readonly direction: 'down' | 'right',
    readonly maxWidth: number,
  ) {}

  /** Edges with both ends inside n (not counting n itself). */
  edgesInside(n: LNode): LEdge[] {
    return this.edges.filter((e) => e.from !== n.id && e.to !== n.id && this.isAncestor(n.id, e.from) && this.isAncestor(n.id, e.to));
  }

  /** A zone that contains an edge endpoint (chips, notes, text and bands do not count). */
  hasEndpointInside(n: LNode): boolean {
    return n.children.some((c) => !DECO.has(c.kind) && (this.endpoints.has(c.id) || this.hasEndpointInside(c)));
  }

  isCompound(n: LNode): boolean {
    return n.kind === 'zone' && !n.size && !n.laid && !special(n) && this.hasEndpointInside(n);
  }

  isAncestor(a: string, b: string): boolean {
    let cur = this.parent.get(b);
    for (let i = 0; cur && i < 100; i++) {
      if (cur === a) return true;
      cur = this.parent.get(cur);
    }
    return false;
  }
}

/** A zone with its own composition: rows, or a band that divides it. */
function special(n: LNode): boolean {
  return n.kind === 'zone' && !n.size && (!!n.rows?.length || n.children.some((c) => c.kind === 'band'));
}

/**
 * The size of a child of a container that is laid out alone (rows, or a
 * segment of a zone): a zone with edges inside gets the elk layout with those
 * edges only; other nodes get their plain size.
 */
async function layoutChild(ctx: Ctx, n: LNode): Promise<Sized> {
  if (n.laid && n.size) return { w: n.size[0], h: n.size[1] };
  if (n.kind === 'zone' && !n.size && ctx.edgesInside(n).length && ctx.isCompound(n)) {
    const boxes = await elkGroup(ctx, [n], ctx.edgesInside(n));
    const b = boxes.get(n.id)!;
    return { w: b.w, h: b.h };
  }
  return sizeNode(ctx.theme, n, ctx.geo);
}

/**
 * Place the children named in `rows` (and the others in one more row) relative
 * to (0, 0). Zones in a row get the row height; zones in a column get the
 * column width; a band spans the block.
 */
async function rowsBlock(ctx: Ctx, kids: LNode[], rows: RowItem[][], gap: number): Promise<Sized> {
  const byId = new Map(kids.map((k) => [k.id, k]));
  const listed = new Set(rows.flat(2));
  const all: RowItem[][] = [...rows];
  const rest = kids.filter((k) => !listed.has(k.id) && !k.at).map((k) => k.id);
  if (rest.length) all.push(rest);
  const size = new Map<string, Sized>();
  for (const id of all.flat(2)) {
    const n = byId.get(id);
    if (n && !size.has(id)) size.set(id, await layoutChild(ctx, n));
  }
  let y = 0;
  let width = 0;
  const bands: LNode[] = [];
  for (const row of all) {
    let x = 0;
    let rowH = 0;
    const cols: Array<{ ids: string[]; w: number; h: number }> = [];
    for (const item of row) {
      const ids = (Array.isArray(item) ? item : [item]).filter((id) => byId.has(id));
      if (!ids.length) continue;
      const colW = Math.max(...ids.map((id) => size.get(id)!.w));
      let cy = y;
      for (const id of ids) {
        const sz = size.get(id)!;
        ctx.geo.set(id, { x, y: cy, w: sz.w, h: sz.h });
        cy += sz.h + gap;
      }
      cols.push({ ids, w: colW, h: cy - gap - y });
      rowH = Math.max(rowH, cy - gap - y);
      x += colW + gap;
    }
    for (const c of cols) {
      const nodes = c.ids.map((id) => byId.get(id)!);
      if (nodes.length === 1) {
        if (nodes[0].kind === 'zone') ctx.geo.get(nodes[0].id)!.h = rowH;
        if (nodes[0].kind === 'band') bands.push(nodes[0]);
        continue;
      }
      for (const n of nodes) if (n.kind === 'zone') ctx.geo.get(n.id)!.w = c.w;
      // The last zone of a column fills the rest of the row height.
      const last = nodes[nodes.length - 1];
      if (last.kind === 'zone') ctx.geo.get(last.id)!.h += rowH - c.h;
    }
    width = Math.max(width, x - gap);
    // A row of headings (notes only) sits close to the row below it.
    const headings = cols.length > 0 && cols.every((c) => c.ids.every((id) => byId.get(id)!.kind === 'note'));
    y += rowH + (headings ? Math.round(gap / 2) : gap);
  }
  for (const b of bands) ctx.geo.get(b.id)!.w = Math.max(ctx.geo.get(b.id)!.w, width);
  for (const k of kids) {
    if (!k.at) continue;
    const sz = await layoutChild(ctx, k);
    ctx.geo.set(k.id, { x: k.at[0], y: k.at[1], w: sz.w, h: sz.h });
  }
  return { w: r(width), h: r(Math.max(0, y - gap)) };
}

/** Lay out a zone with rows, or a zone that a band divides. Writes child geometry; returns the zone size. */
async function layoutSpecial(ctx: Ctx, n: LNode): Promise<Sized> {
  const { theme, geo } = ctx;
  const z = theme.sizes.zone;
  let contentW = 0;
  let bottom = z.header;
  const bands: LNode[] = [];
  if (n.rows?.length) {
    const block = await rowsBlock(ctx, n.children, n.rows, z.gap);
    for (const c of n.children) {
      const g = geo.get(c.id);
      if (g && !c.at) {
        g.x += z.padding;
        g.y += z.header;
      }
    }
    contentW = block.w;
    bottom = z.header + block.h;
  } else {
    // Segments divided by bands.
    const segs: LNode[][] = [[]];
    for (const c of n.children) {
      if (c.at) continue;
      if (c.kind === 'band') segs.push([c], []);
      else segs[segs.length - 1].push(c);
    }
    let y = z.header;
    for (const seg of segs.filter((x) => x.length)) {
      if (seg.length === 1 && seg[0].kind === 'band') {
        const b = seg[0];
        const sz = sizeNode(theme, b, geo);
        geo.set(b.id, { x: z.padding, y, w: sz.w, h: sz.h });
        if (!b.style?.width) bands.push(b);
        contentW = Math.max(contentW, sz.w);
        y += sz.h + z.gap;
        continue;
      }
      const ids = new Set(seg.map((k) => k.id));
      const toKid = (id: string): string | undefined => {
        let cur: string | undefined = id;
        for (let i = 0; cur && i < 100; i++) {
          if (ids.has(cur)) return cur;
          cur = ctx.parent.get(cur);
        }
        return undefined;
      };
      const lifted = ctx.edges.map((e) => ({ from: toKid(e.from) ?? '', to: toKid(e.to) ?? '' })).filter((e) => e.from && e.to && e.from !== e.to);
      let segW = 0;
      let segH = 0;
      if (lifted.length) {
        const pos = await layered(ctx, seg, ctx.edges, lifted, z.maxWidth - 2 * z.padding);
        const minX = Math.min(...[...pos.values()].map((v) => v.x));
        const minY = Math.min(...[...pos.values()].map((v) => v.y));
        for (const k of seg) {
          const v = pos.get(k.id)!;
          geo.set(k.id, { x: v.x - minX + z.padding, y: v.y - minY + y, w: v.w, h: v.h });
          segW = Math.max(segW, v.x - minX + v.w);
          segH = Math.max(segH, v.y - minY + v.h);
        }
      } else {
        const rows = flowRows(theme, seg, geo, z.maxWidth - 2 * z.padding);
        for (const k of seg) {
          const g = geo.get(k.id)!;
          g.x += z.padding;
          g.y += y;
        }
        segW = rows.w;
        segH = rows.h;
      }
      contentW = Math.max(contentW, segW);
      y += segH + z.gap;
    }
    bottom = y - z.gap;
  }
  let w = Math.max(z.minWidth, contentW + 2 * z.padding, zoneTitleWidth(theme, n));
  if (n.style?.width) w = n.style.width;
  for (const b of bands) geo.get(b.id)!.w = Math.max(geo.get(b.id)!.w, w - 2 * z.padding);
  let right = w;
  let bot = bottom + z.padding;
  for (const c of n.children) {
    if (!c.at) continue;
    const sz = await layoutChild(ctx, c);
    geo.set(c.id, { x: c.at[0], y: c.at[1], w: sz.w, h: sz.h });
    right = Math.max(right, c.at[0] + sz.w + z.padding);
    bot = Math.max(bot, c.at[1] + sz.h + z.padding);
  }
  let h = bot;
  if (n.style?.height) h = n.style.height;
  return { w: r(right), h: r(h) };
}

/** Lay out the special zones bottom-up, so the other layouts can treat them as fixed boxes. */
async function precompute(ctx: Ctx, nodes: LNode[]): Promise<void> {
  for (const n of nodes) {
    await precompute(ctx, n.children);
    if (special(n)) {
      const sz = await layoutSpecial(ctx, n);
      n.size = [sz.w, sz.h];
      n.laid = true;
    }
  }
}

function elkOptions(theme: Theme, direction: 'down' | 'right'): Record<string, string> {
  const p = theme.sizes.page;
  return {
    'elk.algorithm': 'layered',
    'elk.direction': direction === 'right' ? 'RIGHT' : 'DOWN',
    'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    'elk.spacing.nodeNode': String(p.nodeGap),
    'elk.layered.spacing.nodeNodeBetweenLayers': String(p.layerGap),
    'elk.spacing.edgeNode': '20',
    'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    'elk.edgeRouting': 'ORTHOGONAL',
    'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
    'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
    'elk.layered.nodePlacement.favorStraightEdges': 'true',
    'elk.padding': '[top=0,left=0,bottom=0,right=0]',
    'elk.randomSeed': '1',
  };
}

/** The elk node of `n`. A compound zone has its graph children inside; the other children go in rows below. */
function toElk(ctx: Ctx, n: LNode, ids: Set<string>): ElkIn {
  ids.add(n.id);
  const { theme, geo } = ctx;
  if (!ctx.isCompound(n)) {
    const s = sizeNode(theme, n, geo);
    return { id: n.id, width: s.w, height: s.h };
  }
  ctx.compound.add(n.id);
  const z = theme.sizes.zone;
  const inGraph = (c: LNode) => !c.at && !DECO.has(c.kind) && (ctx.endpoints.has(c.id) || (c.kind === 'zone' && ctx.hasEndpointInside(c)));
  const graphKids = n.children.filter(inGraph);
  const rowKids = n.children.filter((c) => !c.at && !inGraph(c));
  const at = n.children.filter((c) => c.at);
  const rows = flowRows(theme, rowKids, geo, z.maxWidth - 2 * z.padding);
  for (const c of at) {
    const s = sizeNode(theme, c, geo);
    geo.set(c.id, { x: c.at![0], y: c.at![1], w: s.w, h: s.h });
  }
  ctx.rows.set(n.id, { size: rows, kids: rowKids, bands: rows.bands, at });
  // Rows go beside the graph, away from the flow: on the right for direction
  // down, below for direction right. So lines into and out of the zone do not cross them.
  const side = ctx.direction === 'down';
  const rowsGap = rows.h ? z.gap * 2 : 0;
  const minW = side
    ? Math.max(z.minWidth, zoneTitleWidth(theme, n), n.style?.width ?? 0)
    : Math.max(z.minWidth, zoneTitleWidth(theme, n), rows.w + 2 * z.padding, n.style?.width ?? 0);
  const right = z.padding + (side && rows.w ? rows.w + rowsGap : 0);
  const bottom = z.padding + (!side && rows.h ? rows.h + rowsGap : 0);
  const minH = z.header + (side ? rows.h : 0) + bottom;
  return {
    id: n.id,
    layoutOptions: {
      'elk.padding': `[top=${z.header},left=${z.padding},bottom=${bottom},right=${right}]`,
      'elk.nodeSize.constraints': 'MINIMUM_SIZE',
      // elkjs swaps the two values of the minimum size when the direction is DOWN (seen in 0.12).
      'elk.nodeSize.minimum': side ? `(${r(minH)},${r(minW)})` : `(${r(minW)},${r(minH)})`,
    },
    children: graphKids.map((c) => toElk(ctx, c, ids)),
  };
}

/** Write the geometry of an elk result, and place the rows of compound zones. */
function fromElk(ctx: Ctx, node: ElkOut): void {
  const z = ctx.theme.sizes.zone;
  for (const c of node.children ?? []) {
    const g = { x: r(c.x ?? 0), y: r(c.y ?? 0), w: r(c.width ?? 0), h: r(c.height ?? 0) };
    ctx.geo.set(c.id, g);
    const rows = ctx.rows.get(c.id);
    if (rows) {
      const side = ctx.direction === 'down';
      const left = side ? g.w - z.padding - rows.size.w : z.padding;
      const top = side ? z.header : g.h - z.padding - rows.size.h;
      for (const k of rows.kids) {
        const kg = ctx.geo.get(k.id)!;
        kg.x += left;
        kg.y += top;
      }
      if (!side) for (const b of rows.bands) ctx.geo.get(b.id)!.w = Math.max(ctx.geo.get(b.id)!.w, g.w - 2 * z.padding);
      for (const k of rows.at) {
        const kg = ctx.geo.get(k.id)!;
        g.w = Math.max(g.w, kg.x + kg.w + z.padding);
        g.h = Math.max(g.h, kg.y + kg.h + z.padding);
      }
    }
    fromElk(ctx, c);
  }
}

/** Lay out a group of top-level nodes with elk. Returns the box of each member, relative to the group. */
async function elkGroup(ctx: Ctx, members: LNode[], edges: LEdge[]): Promise<Map<string, Geometry>> {
  const ids = new Set<string>();
  const children = members.map((m) => toElk(ctx, m, ids));
  const lift = (id: string): string | undefined => {
    let cur: string | undefined = id;
    for (let i = 0; cur && i < 100; i++) {
      if (ids.has(cur)) return cur;
      cur = ctx.parent.get(cur);
    }
    return undefined;
  };
  const seen = new Set<string>();
  const elkEdges: Array<{ id: string; sources: string[]; targets: string[] }> = [];
  for (const e of edges) {
    const a = lift(e.from);
    const b = lift(e.to);
    if (!a || !b || a === b || ctx.isAncestor(a, b) || ctx.isAncestor(b, a)) continue;
    const k = `${a}\u0000${b}`;
    if (seen.has(k)) continue;
    seen.add(k);
    elkEdges.push({ id: `e${elkEdges.length}`, sources: [a], targets: [b] });
  }
  const out = (await elk.layout({ id: "root", layoutOptions: elkOptions(ctx.theme, ctx.direction), children, edges: elkEdges } as never)) as unknown as ElkOut;
  fromElk(ctx, out);
  const res = new Map<string, Geometry>();
  for (const m of members) res.set(m.id, ctx.geo.get(m.id)!);
  return res;
}

/**
 * Lay out one page segment. Each connected group gets a layered layout. The
 * groups are packed in rows (direction down) or in one column (direction right),
 * in YAML order.
 */
async function layered(ctx: Ctx, nodes: LNode[], edges: LEdge[], lifted: LEdge[], maxWidth?: number): Promise<Map<string, Geometry>> {
  const p = ctx.theme.sizes.page;
  const ids = new Set(nodes.map((n) => n.id));
  // Connected groups (union-find on top-level edges), in YAML order of their first node.
  const root = new Map(nodes.map((n) => [n.id, n.id]));
  const find = (x: string): string => {
    let c = x;
    while (root.get(c) !== c) c = root.get(c)!;
    root.set(x, c);
    return c;
  };
  for (const e of lifted) if (e.from !== e.to && ids.has(e.from) && ids.has(e.to)) root.set(find(e.from), find(e.to));
  const groups = new Map<string, LNode[]>();
  for (const n of nodes) {
    const g = find(n.id);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(n);
  }
  const out = new Map<string, Geometry>();
  const maxW = maxWidth ?? ctx.maxWidth;
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const members of groups.values()) {
    let boxes: Map<string, Geometry>;
    if (members.length === 1 && !ctx.isCompound(members[0])) {
      const s = sizeNode(ctx.theme, members[0], ctx.geo);
      boxes = new Map([[members[0].id, { x: 0, y: 0, ...s }]]);
    } else boxes = await elkGroup(ctx, members, edges);
    let w = 0;
    let h = 0;
    for (const b of boxes.values()) {
      w = Math.max(w, b.x + b.w);
      h = Math.max(h, b.y + b.h);
    }
    if (direction(ctx) === 'right') {
      for (const [id, b] of boxes) out.set(id, { ...b, y: y + b.y });
      y += h + p.gap;
      continue;
    }
    if (x > 0 && x + w > maxW) {
      x = 0;
      y += rowH + p.gap;
      rowH = 0;
    }
    for (const [id, b] of boxes) out.set(id, { ...b, x: x + b.x, y: y + b.y });
    x += w + p.gap;
    rowH = Math.max(rowH, h);
  }
  return out;
}

function direction(ctx: Ctx): 'down' | 'right' {
  return ctx.direction;
}

/** Place all nodes with the create rules. */
export async function layoutDiagram(theme: Theme, input: LayoutInput): Promise<LayoutResult> {
  const p = theme.sizes.page;
  const geo = new Map<string, Geometry>();
  const ctx = new Ctx(theme, geo, input.direction, input.width ?? p.maxWidth ?? 1200);
  ctx.edges = input.edges.filter((e) => e.layout !== false);
  const walk = (ns: LNode[], par: string) => {
    for (const n of ns) {
      ctx.parent.set(n.id, par);
      walk(n.children, n.id);
    }
  };
  walk(input.nodes, 'page');
  for (const e of ctx.edges) {
    if (e.from === e.to) continue;
    ctx.endpoints.add(e.from);
    ctx.endpoints.add(e.to);
  }
  await precompute(ctx, input.nodes);

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

  // Page rows: the agent composes the page.
  if (input.rows?.length) {
    // Lines run between page rows: use the layer gap, so lanes fit.
    const block = await rowsBlock(ctx, input.nodes, input.rows, p.layerGap);
    for (const n of input.nodes) {
      const g = geo.get(n.id);
      if (g && !n.at) {
        g.x += p.margin;
        g.y += top;
      }
    }
    finishTitles(res, input, theme, block.w);
    return res;
  }

  // Lift edges to their top-level nodes, for the groups.
  const lifted = ctx.edges.map((e) => ({ from: topOf(e.from, ctx.parent), to: topOf(e.to, ctx.parent) }));

  // Split the page into segments at top-level bands.
  type Seg = { band?: LNode; nodes: LNode[] };
  const segs: Seg[] = [];
  let cur: Seg = { nodes: [] };
  for (const n of input.nodes) {
    if (n.at) {
      const boxes = ctx.isCompound(n) ? await elkGroup(ctx, [n], ctx.edges) : new Map([[n.id, { x: 0, y: 0, ...sizeNode(theme, n, geo) }]]);
      const b = boxes.get(n.id)!;
      geo.set(n.id, { x: n.at[0], y: n.at[1], w: b.w, h: b.h });
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
      const s = sizeNode(theme, seg.band, geo);
      geo.set(seg.band.id, { x: p.margin, y, w: s.w, h: s.h });
      if (!seg.band.style?.width) bands.push(seg.band);
      contentW = Math.max(contentW, s.w);
      y += s.h + p.gap;
      continue;
    }
    const pos = await layered(ctx, seg.nodes, ctx.edges, lifted);
    let minX = Infinity;
    let minY = Infinity;
    for (const v of pos.values()) {
      minX = Math.min(minX, v.x);
      minY = Math.min(minY, v.y);
    }
    let segH = 0;
    for (const n of seg.nodes) {
      const v = pos.get(n.id)!;
      const g = { x: p.margin + v.x - minX, y: y + v.y - minY, w: v.w, h: v.h };
      geo.set(n.id, g);
      segH = Math.max(segH, g.y + g.h - y);
      contentW = Math.max(contentW, g.x + g.w - p.margin);
    }
    y += segH + p.gap / 2;
  }
  for (const b of bands) geo.get(b.id)!.w = Math.max(geo.get(b.id)!.w, contentW);
  finishTitles(res, input, theme, contentW);
  return res;
}

function finishTitles(res: LayoutResult, input: LayoutInput, theme: Theme, contentW: number): void {
  const ts = theme.sizes.title;
  if (res.title) res.title.w = r(Math.max(contentW, textWidth(input.title!, ts.fontSize, true) + 8));
  if (res.subtitle) res.subtitle.w = r(Math.max(contentW, Math.min(1000, textWidth(input.subtitle!, ts.subFontSize) + 8)));
  if (res.subtitle && textWidth(input.subtitle!, ts.subFontSize) + 8 > res.subtitle.w) {
    res.subtitle.h = r(lineCount(input.subtitle!, ts.subFontSize, res.subtitle.w) * ts.subFontSize * 1.4 + 4);
  }
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
