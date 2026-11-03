import type { EdgeSpec, NodeSpec } from './dsl/parse.js';
import type { Cell, DrawioDoc, Geometry } from './model/doc.js';
import { fromHtmlLabel, toHtmlLabel } from './model/text.js';
import { hasBase, getStyle } from './model/style.js';
import { contains } from './route/geom.js';
import { textWidth } from './layout/text.js';
import {
  parseOverride,
  renderBadge,
  renderEdge,
  renderNode,
  serializeOverride,
  subtitleStyle,
  titleStyle,
  type StyleOverride,
} from './theme/render.js';
import { NODE_KINDS, type NodeKind, type Theme } from './theme/theme.js';
import { formatPort, formatVia, parsePort, parseViaText, routeEdges, ROUTES, type Box, type EdgeIntent, type Port, type RouteStyle, type ViaItem } from './route/route.js';

export const A = {
  kind: 'dgm_kind',
  tone: 'dgm_tone',
  icon: 'dgm_icon',
  variant: 'dgm_variant',
  style: 'dgm_style',
  role: 'dgm_role',
  theme: 'dgm_theme',
  direction: 'dgm_direction',
  fromPort: 'dgm_from_port',
  toPort: 'dgm_to_port',
  via: 'dgm_via',
  route: 'dgm_route',
  rows: 'dgm_rows',
  width: 'dgm_width',
  layout: 'dgm_layout',
} as const;

export type RowItem = string | string[];

export function parseRowsAttr(v: string | undefined): RowItem[][] | undefined {
  if (!v) return undefined;
  try {
    const x = JSON.parse(v) as unknown;
    return Array.isArray(x) ? (x as RowItem[][]) : undefined;
  } catch {
    return undefined;
  }
}

export const SUB_KINDS: NodeKind[] = ['card', 'cylinder'];
const TITLE_ID = '_title';
const SUBTITLE_ID = '_subtitle';

export interface NodeInfo {
  id: string;
  /** "page" or the id of the parent node. */
  parent: string;
  kind: NodeKind | 'raw';
  tone?: string;
  icon?: string;
  variant?: string;
  style?: StyleOverride;
  title: string;
  sub?: string;
  rows?: RowItem[][];
  geo: Geometry;
  cell: Cell;
}

export interface EdgeInfo {
  id: string;
  from: string;
  to: string;
  /** "from -> to", with "#2", "#3" for more edges between the same nodes. */
  ref: string;
  label?: string;
  kind?: string;
  variant?: string;
  badge?: string;
  fromPort?: Port;
  toPort?: Port;
  via: ViaItem[];
  route?: RouteStyle;
  /** false: the edge does not affect the placement. */
  layout?: boolean;
  /** Waypoints in the coordinates of the edge parent. */
  points: Array<[number, number]>;
  cell: Cell;
}

export interface DiagramView {
  title?: string;
  subtitle?: string;
  theme: string;
  direction: 'down' | 'right';
  rows?: RowItem[][];
  width?: number;
  nodes: NodeInfo[];
  edges: EdgeInfo[];
  byId: Map<string, NodeInfo>;
}

function isNodeKind(k: string | undefined): k is NodeKind {
  return !!k && (NODE_KINDS as readonly string[]).includes(k);
}

/** Read the semantic view of the first page. */
export function readView(doc: DrawioDoc): DiagramView {
  const cells = doc.cells();
  const byCell = new Map(cells.map((c) => [c.id, c]));
  const layers = new Set(cells.filter((c) => doc.parentId(c) === '0').map((c) => c.id));
  const edgeIds = new Set(cells.filter((c) => doc.isEdge(c)).map((c) => c.id));
  const role = (c: Cell) => doc.attr(c, A.role);

  /** The node that owns a cell: helpers belong to their parent. */
  const owner = (id: string | undefined): string | undefined => {
    let cur = id;
    for (let i = 0; cur && i < 50; i++) {
      const c = byCell.get(cur);
      if (!c) return cur;
      if (!role(c)) return cur;
      cur = doc.parentId(c);
    }
    return cur;
  };

  const view: DiagramView = {
    theme: doc.pageAttr(A.theme) ?? 'pro',
    direction: doc.pageAttr(A.direction) === 'right' ? 'right' : 'down',
    rows: parseRowsAttr(doc.pageAttr(A.rows)),
    width: Number(doc.pageAttr(A.width)) || undefined,
    nodes: [],
    edges: [],
    byId: new Map(),
  };

  const extraEdgeLabels = new Map<string, string[]>();
  for (const c of cells) {
    if (c.id === '0' || layers.has(c.id)) continue;
    const r = role(c);
    const parent = doc.parentId(c) ?? '1';
    if (r === 'title') view.title = fromHtmlLabel(doc.label(c));
    if (r === 'subtitle') view.subtitle = fromHtmlLabel(doc.label(c));
    if (r) continue;
    if (doc.isEdge(c)) continue;
    if (edgeIds.has(parent)) {
      // A label that a person added to an edge in draw.io.
      const t = fromHtmlLabel(doc.label(c));
      if (t) extraEdgeLabels.set(parent, [...(extraEdgeLabels.get(parent) ?? []), t]);
      continue;
    }
    if (!doc.isVertex(c)) continue;
    const k = doc.attr(c, A.kind);
    const kind = isNodeKind(k) ? k : 'raw';
    const n: NodeInfo = {
      id: c.id,
      parent: layers.has(parent) ? 'page' : parent,
      kind,
      title: fromHtmlLabel(doc.label(c)),
      geo: doc.geometry(c) ?? { x: 0, y: 0, w: 0, h: 0 },
      cell: c,
    };
    if (kind !== 'raw') {
      n.tone = doc.attr(c, A.tone);
      n.icon = doc.attr(c, A.icon);
      n.variant = doc.attr(c, A.variant);
      n.style = parseOverride(doc.attr(c, A.style));
      n.rows = parseRowsAttr(doc.attr(c, A.rows));
    }
    view.nodes.push(n);
    view.byId.set(n.id, n);
  }
  for (const c of cells) {
    if (role(c) === 'sub') {
      const n = view.byId.get(doc.parentId(c) ?? '');
      if (n) n.sub = fromHtmlLabel(doc.label(c));
    }
  }

  const refCount = new Map<string, number>();
  for (const c of cells) {
    if (!doc.isEdge(c)) continue;
    const from = owner(doc.source(c)) ?? '?';
    const to = owner(doc.target(c)) ?? '?';
    const base = `${from} -> ${to}`;
    const n = (refCount.get(base) ?? 0) + 1;
    refCount.set(base, n);
    const labels = [fromHtmlLabel(doc.label(c)), ...(extraEdgeLabels.get(c.id) ?? [])].filter(Boolean);
    const e: EdgeInfo = { id: c.id, from, to, ref: n > 1 ? `${base}#${n}` : base, cell: c, via: parseViaText(doc.attr(c, A.via)), points: doc.edgePoints(c) };
    if (labels.length) e.label = labels.join(' / ');
    e.kind = doc.attr(c, A.kind);
    e.variant = doc.attr(c, A.variant);
    const fp = doc.attr(c, A.fromPort);
    const tp = doc.attr(c, A.toPort);
    if (fp) e.fromPort = parsePort(fp);
    if (tp) e.toPort = parsePort(tp);
    if (doc.attr(c, A.layout) === '0') e.layout = false;
    const rt = doc.attr(c, A.route);
    if (rt && (ROUTES as string[]).includes(rt)) e.route = rt as RouteStyle;
    view.edges.push(e);
  }
  for (const c of cells) {
    if (role(c) === 'badge') {
      const e = view.edges.find((x) => x.id === doc.parentId(c));
      if (e) e.badge = fromHtmlLabel(doc.label(c));
    }
  }
  return view;
}

/** Find an edge by reference ("a -> b", "a -> b#2") or by cell id. */
export function findEdge(view: DiagramView, ref: string): EdgeInfo | undefined {
  const norm = ref
    .replace(/:[trbl](@\d*\.?\d+)?(?=\s|$|#)/g, '')
    .replace(/\s*->\s*/, ' -> ')
    .trim();
  return view.edges.find((e) => e.ref === norm || (norm.endsWith('#1') && e.ref === norm.slice(0, -2)) || e.id === ref);
}

/** The page box of each vertex (geometry plus the offsets of its parents). */
export function absBoxes(doc: DrawioDoc): Map<string, Box> {
  const cells = doc.cells();
  const byId = new Map(cells.map((c) => [c.id, c]));
  const out = new Map<string, Box>();
  const abs = (id: string, depth = 0): Box | undefined => {
    if (out.has(id)) return out.get(id);
    const c = byId.get(id);
    if (!c || !doc.isVertex(c) || depth > 50) return undefined;
    const g = doc.geometry(c);
    if (!g) return undefined;
    const p = doc.parentId(c);
    const pb = p ? abs(p, depth + 1) : undefined;
    const b = { x: g.x + (pb?.x ?? 0), y: g.y + (pb?.y ?? 0), w: g.w, h: g.h };
    out.set(id, b);
    return b;
  };
  for (const c of cells) abs(c.id);
  return out;
}

/** True for a cell that contains other cells: a dgm zone, or a draw.io container or swimlane. */
export function isContainer(doc: DrawioDoc, c: Cell): boolean {
  const st = doc.style(c);
  return doc.attr(c, A.kind) === 'zone' || getStyle(st, 'container') === '1' || hasBase(st, 'swimlane');
}

/**
 * Boxes that a line should not cross: cards, cylinders, chips, notes, text,
 * raw cells, and the title of each zone; not zones, bands or containers.
 */
export function obstacles(doc: DrawioDoc, view: DiagramView, boxes: Map<string, Box>, theme?: Theme): Array<{ id: string; box: Box }> {
  const out: Array<{ id: string; box: Box }> = [];
  for (const n of view.nodes) {
    if (n.kind === 'zone' && theme) {
      const b = boxes.get(n.id);
      const fs = theme.sizes.zone.fontSize;
      if (b && n.title) out.push({ id: `${n.id} (title)`, box: { x: b.x + 8, y: b.y + 6, w: Math.min(b.w - 16, textWidth(n.title, fs, true) + (n.icon ? 38 : 16) + 8), h: 22 } });
    }
    if (n.kind === 'zone' || n.kind === 'band' || isContainer(doc, n.cell)) continue;
    const b = boxes.get(n.id);
    if (b && b.w > 0 && b.h > 0) out.push({ id: n.id, box: b });
  }
  return out;
}

/** A text that may need to move into the zone under it: a text or note node, or a raw text cell. */
function isFloatingTextCandidate(doc: DrawioDoc, n: NodeInfo): boolean {
  if (n.kind === 'text' || n.kind === 'note') return true;
  return n.kind === 'raw' && hasBase(doc.style(n.cell), 'text');
}

/** Texts whose box is inside a zone that is not their parent: [text id, innermost zone id]. */
export function floatingTexts(doc: DrawioDoc, view: DiagramView): Array<[string, string]> {
  const boxes = absBoxes(doc);
  const zones = view.nodes.filter((n) => isContainer(doc, n.cell));
  const out: Array<[string, string]> = [];
  for (const n of view.nodes) {
    if (!isFloatingTextCandidate(doc, n)) continue;
    const b = boxes.get(n.id);
    if (!b) continue;
    let best: NodeInfo | undefined;
    let bestArea = Infinity;
    for (const z of zones) {
      if (z.id === n.id) continue;
      const zb = boxes.get(z.id);
      if (!zb || !contains(zb, b)) continue;
      // Not a zone inside the text itself.
      let cur: string | undefined = z.id;
      let inside = false;
      for (let i = 0; cur && i < 50; i++) {
        if (cur === n.id) inside = true;
        cur = view.byId.get(cur)?.parent;
      }
      if (inside) continue;
      if (zb.w * zb.h < bestArea) {
        best = z;
        bestArea = zb.w * zb.h;
      }
    }
    if (best && n.parent !== best.id) out.push([n.id, best.id]);
  }
  return out;
}

export interface EdgeIntentFields {
  fromPort?: Port | null;
  toPort?: Port | null;
  via?: ViaItem[] | null;
  route?: RouteStyle | null;
}

/** Writes dgm cells into a document with a theme. */
export class Editor {
  constructor(
    readonly doc: DrawioDoc,
    readonly theme: Theme,
  ) {}

  /** The tone of a node: its own tone, else the tone of the nearest parent zone, else the theme default. */
  effectiveTone(id: string): string {
    const d = this.doc;
    let cur: string | undefined = id;
    for (let i = 0; cur && i < 50; i++) {
      const c = d.get(cur);
      if (!c) break;
      const t = d.attr(c, A.tone);
      if (t && this.theme.tones[t] && (cur === id || d.attr(c, A.kind) === 'zone')) return t;
      cur = d.parentId(c);
    }
    return this.theme.defaultTone;
  }

  private helpers(id: string): Cell[] {
    const d = this.doc;
    return d.cells().filter((c) => d.parentId(c) === id && d.attr(c, A.role));
  }

  /**
   * Write the style and the helper cells of a node from its attributes and
   * geometry. `sub`: undefined keeps the subtitle, null removes it.
   */
  renderNode(id: string, sub?: string | null): void {
    const d = this.doc;
    const c = d.get(id);
    if (!c) return;
    const kind = d.attr(c, A.kind);
    if (!isNodeKind(kind)) return;
    const geo = d.geometry(c) ?? { x: 0, y: 0, w: 120, h: 60 };
    const existing = this.helpers(id);
    const oldSub = existing.find((h) => d.attr(h, A.role) === 'sub');
    let subLabel: string | undefined;
    if (sub === undefined) subLabel = oldSub ? d.label(oldSub) : undefined;
    else if (sub !== null) subLabel = toHtmlLabel(sub);
    const hasSub = subLabel !== undefined && SUB_KINDS.includes(kind);
    const out = renderNode(
      this.theme,
      {
        kind,
        tone: this.effectiveTone(id),
        icon: d.attr(c, A.icon),
        variant: d.attr(c, A.variant),
        style: parseOverride(d.attr(c, A.style)),
        hasSub,
      },
      geo.w,
      geo.h,
    );
    d.setStyle(c, out.style);
    const wanted = new Set(out.helpers.map((h) => h.role));
    for (const h of existing) {
      const r = d.attr(h, A.role)!;
      if ((r === 'icon' || r === 'sub') && !wanted.has(r)) d.removeCell(h);
    }
    for (const h of [...out.helpers].reverse()) {
      const hid = `${id}.${h.suffix}`;
      let cell = existing.find((e) => d.attr(e, A.role) === h.role);
      const g = { x: h.x, y: h.y, w: h.w, h: h.h };
      if (cell) {
        if (cell.id !== hid) cell = d.rename(cell, hid);
        d.setStyle(cell, h.style);
        d.setGeometry(cell, g);
        if (h.role === 'sub') d.setLabel(cell, subLabel ?? '');
      } else {
        d.addCell({
          id: hid,
          parent: id,
          type: 'vertex',
          label: h.role === 'sub' ? (subLabel ?? '') : '',
          style: h.style,
          attrs: [[A.role, h.role]],
          geometry: g,
          after: c,
        });
      }
    }
  }

  /** Render a node and all nodes inside it (for tone inheritance). */
  renderTree(id: string, sub?: string | null): void {
    this.renderNode(id, sub);
    const d = this.doc;
    for (const c of d.cells()) {
      if (d.parentId(c) === id && !d.attr(c, A.role) && d.isVertex(c)) this.renderTree(c.id);
    }
  }

  /** Add a node and its children. `geo` holds the geometry of each node. */
  insertNode(spec: NodeSpec, parent: string, geo: Map<string, Geometry>): void {
    const attrs: Array<[string, string]> = [[A.kind, spec.kind]];
    if (spec.tone) attrs.push([A.tone, spec.tone]);
    if (spec.icon) attrs.push([A.icon, spec.icon]);
    if (spec.variant) attrs.push([A.variant, spec.variant]);
    const st = serializeOverride(spec.style);
    if (st) attrs.push([A.style, st]);
    if (spec.rows?.length) attrs.push([A.rows, JSON.stringify(spec.rows)]);
    this.doc.addCell({
      id: spec.id,
      parent,
      type: 'vertex',
      label: toHtmlLabel(spec.title),
      style: '',
      attrs,
      geometry: geo.get(spec.id) ?? { x: 0, y: 0, w: 120, h: 60 },
    });
    this.renderNode(spec.id, spec.sub ?? null);
    for (const ch of spec.children) this.insertNode(ch, spec.id, geo);
  }

  nextEdgeId(): string {
    const used = new Set(this.doc.cells().map((c) => c.id));
    for (let i = 1; ; i++) if (!used.has(`e${i}`)) return `e${i}`;
  }

  insertEdge(e: EdgeSpec): string {
    const id = this.nextEdgeId();
    const attrs: Array<[string, string]> = [[A.kind, e.kind ?? 'default']];
    if (e.variant) attrs.push([A.variant, e.variant]);
    const fp = formatPort(e.fromPort);
    const tp = formatPort(e.toPort);
    const via = formatVia(e.via ?? []);
    if (fp) attrs.push([A.fromPort, fp]);
    if (tp) attrs.push([A.toPort, tp]);
    if (via) attrs.push([A.via, via]);
    if (e.route && e.route !== 'straight') attrs.push([A.route, e.route]);
    if (e.layout === false) attrs.push([A.layout, '0']);
    this.doc.addCell({
      id,
      parent: '1',
      type: 'edge',
      label: e.label ? toHtmlLabel(e.label) : '',
      style: '',
      attrs,
      source: e.from,
      target: e.to,
    });
    this.renderEdge(id, e.badge ?? null);
    return id;
  }

  /** Write the style of an edge and its badge. `badge`: undefined keeps it, null removes it. */
  renderEdge(id: string, badge?: string | null): void {
    const d = this.doc;
    const c = d.get(id);
    if (!c) return;
    const look = { kind: d.attr(c, A.kind), variant: d.attr(c, A.variant), route: d.attr(c, A.route) as RouteStyle | undefined };
    if (look.kind !== undefined) d.setStyle(c, renderEdge(this.theme, look));
    const old = this.helpers(id).find((h) => d.attr(h, A.role) === 'badge');
    const text = badge === undefined ? (old ? d.label(old) : undefined) : badge === null ? undefined : toHtmlLabel(badge);
    if (text === undefined) {
      if (old) d.removeCell(old);
      return;
    }
    const style = renderBadge(this.theme, look);
    if (old) {
      d.setStyle(old, style);
      d.setLabel(old, text);
    } else {
      d.addCell({
        id: `${id}.badge`,
        parent: id,
        type: 'vertex',
        label: text,
        style,
        attrs: [[A.role, 'badge']],
        edgeGeometry: { x: -0.6, y: 0, w: 22, h: 22, ox: -11, oy: -11 },
        after: c,
      });
    }
  }

  /** Style rule: move floating texts into the zone under them, at the same page position. Returns "text into zone" lines. */
  groupText(): string[] {
    if (!this.theme.rules.groupText) return [];
    const d = this.doc;
    const moved: string[] = [];
    for (const [id, zone] of floatingTexts(d, readView(d))) {
      const boxes = absBoxes(d);
      const b = boxes.get(id)!;
      const zb = boxes.get(zone)!;
      const c = d.get(id)!;
      d.setParent(c, zone);
      d.setGeometry(c, { x: b.x - zb.x, y: b.y - zb.y, w: b.w, h: b.h });
      moved.push(`${id} into ${zone}`);
    }
    return moved;
  }

  /** Change the stored intent of an edge. null removes a field. */
  setEdgeIntent(id: string, f: EdgeIntentFields): void {
    const d = this.doc;
    let c = d.get(id);
    if (!c) return;
    if ('fromPort' in f) c = d.setAttr(c, A.fromPort, formatPort(f.fromPort ?? undefined));
    if ('toPort' in f) c = d.setAttr(c, A.toPort, formatPort(f.toPort ?? undefined));
    if ('via' in f) c = d.setAttr(c, A.via, formatVia(f.via ?? []));
    if ('route' in f) d.setAttr(c, A.route, f.route && f.route !== 'straight' ? f.route : undefined);
  }

  /**
   * Compute the ports and points of the dgm edges from their intent, and write
   * them when they change. Legacy edges (orthogonal, written before routing
   * existed) are routed only when `force` names them or `includeLegacy` is set.
   * Edges in `keep` keep their points (a person changed them).
   */
  routeAll(opts: { force?: Set<string>; includeLegacy?: boolean; keep?: Set<string> } = {}): string[] {
    const d = this.doc;
    const view = readView(d);
    const boxes = absBoxes(d);
    const intents: EdgeIntent[] = [];
    const looks = new Map<string, { kind?: string; variant?: string; route: RouteStyle }>();
    for (const e of view.edges) {
      if (!e.kind || opts.keep?.has(e.id)) continue;
      if (!boxes.has(e.from) || !boxes.has(e.to) || e.from === e.to) continue;
      const legacy = !e.route && !e.fromPort && !e.toPort && !e.via.length && d.style(e.cell).includes('edgeStyle=orthogonalEdgeStyle');
      if (legacy && !opts.includeLegacy && !opts.force?.has(e.id)) continue;
      intents.push({ id: e.id, from: e.from, to: e.to, fromPort: e.fromPort, toPort: e.toPort, via: e.via });
      looks.set(e.id, { kind: e.kind, variant: e.variant, route: e.route ?? 'straight' });
    }
    // Zones and bands: lines may cross them, but should not run along their border.
    const zones = view.nodes.filter((n) => isContainer(d, n.cell) || n.kind === 'band').map((n) => boxes.get(n.id)).filter((b): b is Box => !!b);
    const routed = routeEdges(intents, boxes, this.theme.rules.laneMargin, obstacles(d, view, boxes, this.theme), zones);
    const changed: string[] = [];
    for (const [id, r] of routed) {
      const c = d.get(id)!;
      const parent = d.parentId(c);
      const off = parent ? boxes.get(parent) : undefined;
      const pts = r.points.map(([x, y]) => [x - (off?.x ?? 0), y - (off?.y ?? 0)] as [number, number]);
      const style = renderEdge(this.theme, looks.get(id)!, r);
      const oldPts = d.edgePoints(c);
      const samePts = oldPts.length === pts.length && oldPts.every((p, i) => Math.abs(p[0] - pts[i][0]) < 0.01 && Math.abs(p[1] - pts[i][1]) < 0.01);
      if (d.style(c) !== style || !samePts) changed.push(id);
      if (d.style(c) !== style) d.setStyle(c, style);
      if (!samePts) d.setEdgePoints(c, pts);
    }
    return changed;
  }

  /** Write or remove the title and subtitle cells. */
  setTitles(title: string | undefined, subtitle: string | undefined, tg?: Geometry, sg?: Geometry): void {
    const d = this.doc;
    const put = (id: string, role: string, text: string | undefined, style: string, g?: Geometry) => {
      const c = d.get(id);
      if (text === undefined || !g) {
        if (c && text === undefined) d.removeCell(c);
        return;
      }
      if (c) {
        d.setLabel(c, toHtmlLabel(text));
        d.setStyle(c, style);
        d.setGeometry(c, g);
      } else {
        const layer = d.get('1');
        d.addCell({ id, parent: '1', type: 'vertex', label: toHtmlLabel(text), style, attrs: [[A.role, role]], geometry: g, after: layer });
      }
    };
    // Insert the subtitle first, so the title comes first in the file.
    put(SUBTITLE_ID, 'subtitle', subtitle, subtitleStyle(this.theme), sg);
    put(TITLE_ID, 'title', title, titleStyle(this.theme), tg);
  }
}
