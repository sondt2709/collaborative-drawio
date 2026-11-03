import { Document, isMap, isScalar, isSeq, type YAMLMap } from 'yaml';
import type { DiagramView, NodeInfo } from '../diagram.js';
import { formatPort, formatViaItem } from '../route/route.js';
import { loadDiagram, type IO } from './common.js';

function nodeValue(n: NodeInfo, kids: NodeInfo[], all: NodeInfo[], geometry: boolean): unknown {
  const at = geometry ? [Math.round(n.geo.x), Math.round(n.geo.y)] : undefined;
  if (n.kind === 'card' && !n.sub && !n.tone && !n.icon && !n.variant && !n.style && !at && !kids.length) return n.title;
  const o: Record<string, unknown> = {};
  if (n.kind !== 'card') o.kind = n.kind;
  o.title = n.title;
  if (n.sub !== undefined) o.sub = n.sub;
  if (n.tone) o.tone = n.tone;
  if (n.icon) o.icon = n.icon;
  if (n.variant) o.variant = n.variant;
  if (n.style) o.style = n.style;
  if (at) o.at = at;
  if (n.rows) o.rows = n.rows;
  if (kids.length) o.nodes = nodesOf(n.id, all, geometry);
  return o;
}

function nodesOf(parent: string, all: NodeInfo[], geometry: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const n of all.filter((x) => x.parent === parent)) {
    out[n.id] = nodeValue(n, all.filter((x) => x.parent === n.id), all, geometry);
  }
  return out;
}

/** The diagram in the YAML format of dgm create. */
export function viewToYaml(view: DiagramView, geometry = false): string {
  const obj: Record<string, unknown> = {};
  if (view.title !== undefined) obj.title = view.title;
  if (view.subtitle !== undefined) obj.subtitle = view.subtitle;
  obj.theme = view.theme;
  if (view.direction !== 'down') obj.direction = view.direction;
  if (view.width) obj.width = view.width;
  if (view.rows) obj.rows = view.rows;
  const ids = new Set(view.nodes.map((n) => n.id));
  // Nodes whose parent is not a node (for example a cell inside an edge) go to the top level.
  const all = view.nodes.map((n) => (n.parent === 'page' || ids.has(n.parent) ? n : { ...n, parent: 'page' }));
  obj.nodes = nodesOf('page', all, geometry);
  if (view.edges.length) {
    obj.edges = view.edges.map((e) => {
      const fp = formatPort(e.fromPort);
      const tp = formatPort(e.toPort);
      const from = fp ? `${e.from}:${fp}` : e.from;
      const to = tp ? `${e.to}:${tp}` : e.to;
      const via = e.via.map(formatViaItem);
      const extra = (e.kind && e.kind !== 'default') || e.variant || e.badge || e.route || e.layout === false;
      if (!extra) {
        const text = `${from} -> ${to}${via.length ? ` via ${via.join(', ')}` : ''}`;
        return e.label === undefined ? text : { [text]: e.label };
      }
      const o: Record<string, unknown> = { from, to };
      if (e.label !== undefined) o.label = e.label;
      if (e.kind && e.kind !== 'default') o.kind = e.kind;
      if (e.variant) o.variant = e.variant;
      if (e.badge) o.badge = e.badge;
      if (via.length) o.via = via.length === 1 ? via[0] : via;
      if (e.route) o.route = e.route;
      if (e.layout === false) o.layout = false;
      return o;
    });
  }
  const doc = new Document(obj);

  // Leaf nodes and edges on one line each.
  const flowNodes = (m: unknown) => {
    if (!isMap(m)) return;
    for (const pair of (m as YAMLMap).items) {
      const v = pair.value;
      if (!isMap(v)) continue;
      const nodes = v.get('nodes', true);
      if (nodes) flowNodes(nodes);
      else v.flow = true;
      const style = v.get('style', true);
      if (isMap(style)) style.flow = true;
      const rows = v.get('rows', true);
      if (isSeq(rows)) for (const r of rows.items) if (isSeq(r)) r.flow = true;
      const at = v.get('at', true);
      if (isSeq(at)) at.flow = true;
    }
  };
  flowNodes(doc.get('nodes', true));
  const pageRows = doc.get('rows', true);
  if (isSeq(pageRows)) for (const r of pageRows.items) if (isSeq(r)) r.flow = true;
  const edges = doc.get('edges', true);
  if (isSeq(edges)) for (const it of edges.items) if (isMap(it) && it.items.length > 1) it.flow = true;
  // --geometry: the size of each node as a comment, so the agent can compute lanes.
  if (geometry) {
    const sizes = new Map(view.nodes.map((n) => [n.id, `${Math.round(n.geo.w)}x${Math.round(n.geo.h)}`]));
    const tag = (m: unknown) => {
      if (!isMap(m)) return;
      for (const pair of (m as YAMLMap).items) {
        const k = String((pair.key as { value?: unknown })?.value ?? pair.key);
        const v = pair.value as { comment?: string } | null;
        if (v && typeof v === 'object' && sizes.has(k)) {
          // A zone is a block map: the comment goes on its key line.
          if (isMap(pair.value) && !(pair.value as YAMLMap).flow && isScalar(pair.key)) pair.key.comment = ` size ${sizes.get(k)}`;
          else v.comment = ` size ${sizes.get(k)}`;
        }
        if (isMap(pair.value)) tag((pair.value as YAMLMap).get('nodes', true));
      }
    };
    tag(doc.get('nodes', true));
  }
  return doc.toString({ lineWidth: 0 });
}

export function show(io: IO, file: string, opts: { geometry?: boolean }): number {
  const { view } = loadDiagram(io, file);
  io.out(viewToYaml(view, opts.geometry).trimEnd());
  return 0;
}
