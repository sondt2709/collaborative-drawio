import { checkDoc, formatCheck, layoutHints } from '../check.js';
import { A, Editor, SUB_KINDS, absBoxes, findEdge, readView, type DiagramView, type EdgeIntentFields, type NodeInfo } from '../diagram.js';
import { parseApply, readYaml, viaIds, type ApplySpec, type NodeSpec } from '../dsl/parse.js';
import { EXIT, ValidationError } from '../errors.js';
import { overlap, placeBelow, placeInZone, placeNear, sizeNode, type Box } from '../layout/layout.js';
import type { DrawioDoc, Geometry } from '../model/doc.js';
import { fromHtmlLabel, toHtmlLabel } from '../model/text.js';
import { serializeOverride } from '../theme/render.js';
import type { NodeKind, Theme } from '../theme/theme.js';
import { pending, personRoutes, record, snapshot, summarize, type PersonRoute } from '../track/track.js';
import { portFromFraction } from '../route/route.js';
import { loadDiagram, plural, readInput, specToLNode, writeDoc, type IO } from './common.js';

const ICON_KINDS: NodeKind[] = ['card', 'cylinder', 'zone', 'chip', 'band'];

export interface ApplyResult {
  lines: string[];
  warnings: string[];
}

function flatten(n: NodeSpec): NodeSpec[] {
  return [n, ...n.children.flatMap(flatten)];
}

/**
 * Run apply operations on a document in memory, in the order add, set,
 * connect, move, remove. Throws a ValidationError (and the caller writes
 * nothing) when one operation is invalid.
 */
export function executeApply(doc: DrawioDoc, theme: Theme, ops: ApplySpec, opts: { personRoutes?: Map<string, PersonRoute> } = {}): ApplyResult {
  const ed = new Editor(doc, theme);
  const problems: string[] = [];
  const bad = (path: string, msg: string) => problems.push(`${path}: ${msg}`);
  const warnings: string[] = [];
  let view: DiagramView = readView(doc);
  const refresh = () => {
    view = readView(doc);
  };
  const layer = doc.cells().find((c) => doc.parentId(c) === '0')?.id ?? '1';
  const before = new Map(view.nodes.map((n) => [n.id, { ...n.geo }]));
  const touchedEdges = new Set<string>();
  const kept: string[] = [];
  // Routes that a person changed in draw.io become the edge intent, so they stay.
  const steered = new Set(ops.set.filter((o) => o.ref.includes('->') && ('via' in o.fields || 'from' in o.fields || 'to' in o.fields)).map((o) => findEdge(view, o.ref)?.id ?? ''));
  kept.push(...keepPersonRoutes(doc, ed, opts.personRoutes, steered));
  if (kept.length) refresh();
  const renamed = new Map<string, string>(); // new id -> old id
  const isZone = (id: string) => view.byId.get(id)?.kind === 'zone';
  const boxes = (parent: string, except?: string): Box[] =>
    view.nodes.filter((n) => n.parent === parent && n.id !== except).map((n) => ({ id: n.id, kind: n.kind, ...n.geo }));
  const topOf = (id: string): string => {
    let cur = id;
    for (let i = 0; i < 50; i++) {
      const p = view.byId.get(cur)?.parent;
      if (!p || p === 'page') return cur;
      cur = p;
    }
    return cur;
  };
  const isInside = (id: string, ancestor: string): boolean => {
    let cur: string | undefined = id;
    for (let i = 0; cur && i < 50; i++) {
      if (cur === ancestor) return true;
      cur = view.byId.get(cur)?.parent;
    }
    return false;
  };
  const grown = new Set<string>();
  const growZone = (id: string) => {
    let cur: string | undefined = id;
    const pad = theme.sizes.zone.padding;
    while (cur && cur !== 'page' && isZone(cur)) {
      const n: NodeInfo = view.byId.get(cur)!;
      const kids = boxes(cur);
      const w = Math.max(n.geo.w, ...kids.map((k) => k.x + k.w + pad));
      const h = Math.max(n.geo.h, ...kids.map((k) => k.y + k.h + pad));
      if (w > n.geo.w || h > n.geo.h) {
        doc.setGeometry(doc.get(cur)!, { ...n.geo, w, h });
        ed.renderNode(cur);
        grown.add(cur);
        refresh();
      }
      cur = n.parent;
    }
  };

  // ---- add
  const added: string[] = [];
  for (const spec of ops.add) {
    const all = flatten(spec);
    let ok = true;
    for (const n of all) {
      if (doc.has(n.id)) {
        bad(n.path, `id "${n.id}" exists. Use set to change it`);
        ok = false;
      }
    }
    let parent = 'page';
    if (spec.in !== undefined && spec.in !== 'page') {
      if (!isZone(spec.in)) {
        bad(`${spec.path}.in`, view.byId.has(spec.in) ? `"${spec.in}" is not a zone` : `unknown zone "${spec.in}"`);
        ok = false;
      } else parent = spec.in;
    }
    if (spec.near !== undefined && !view.byId.has(spec.near)) {
      bad(`${spec.path}.near`, `unknown node "${spec.near}"`);
      ok = false;
    }
    if (!ok) continue;
    const geo = new Map<string, Geometry>();
    const size = sizeNode(theme, specToLNode(spec), geo);
    let pos: { x: number; y: number };
    if (spec.at) pos = { x: spec.at[0], y: spec.at[1] };
    else if (parent !== 'page') pos = placeInZone(theme, view.byId.get(parent)!.geo, boxes(parent), size, spec.kind);
    else if (spec.near) pos = placeNear(theme, view.byId.get(topOf(spec.near))!.geo, boxes('page'), size, view.direction);
    else pos = placeBelow(theme, boxes('page'));
    if (spec.kind === 'band' && parent === 'page' && !spec.style?.width) {
      const top = boxes('page');
      if (top.length) size.w = Math.max(size.w, Math.max(...top.map((b) => b.x + b.w)) - Math.min(...top.map((b) => b.x)));
    }
    const g = { ...pos, w: size.w, h: size.h };
    geo.set(spec.id, g);
    const hit = boxes(parent).find((b) => overlap(g, b));
    if (hit) warnings.push(`warning: ${spec.id} overlaps ${hit.id}. Run dgm layout to place all nodes again.`);
    ed.insertNode(spec, parent === 'page' ? layer : parent, geo);
    refresh();
    if (parent !== 'page') growZone(parent);
    added.push(...all.map((n) => n.id));
  }

  // ---- set
  const changedNodes: string[] = [];
  const changedEdges: string[] = [];
  for (const op of ops.set) {
    const f = op.fields;
    if (op.ref.includes('->')) {
      const e = findEdge(view, op.ref);
      if (!e) {
        bad(op.path, `unknown edge "${op.ref}"`);
        continue;
      }
      let c = doc.get(e.id)!;
      if ('label' in f) doc.setLabel(c, f.label ? toHtmlLabel(f.label) : '');
      if ('edgeKind' in f || 'variant' in f || 'badge' in f) {
        if ('edgeKind' in f || !doc.attr(c, A.kind)) c = doc.setAttr(c, A.kind, f.edgeKind ?? doc.attr(c, A.kind) ?? 'default');
        if ('variant' in f) c = doc.setAttr(c, A.variant, f.variant ?? undefined);
      }
      for (const end of ['from', 'to'] as const) {
        const v = f[end];
        if (v && !view.byId.has(v.id)) bad(`${op.path}.${end}`, `unknown node "${v.id}"`);
      }
      for (const vid of viaIds({ via: f.via ?? undefined })) if (!view.byId.has(vid)) bad(`${op.path}.via`, `unknown node "${vid}" in via`);
      if (problems.length) continue;
      if (f.from && f.from.id !== e.from) c.cell.setAttribute('source', f.from.id);
      if (f.to && f.to.id !== e.to) c.cell.setAttribute('target', f.to.id);
      const intent: EdgeIntentFields = {};
      if (f.from) intent.fromPort = f.from.port ?? null;
      if (f.to) intent.toPort = f.to.port ?? null;
      if ('via' in f) intent.via = f.via ?? null;
      if ('route' in f) intent.route = f.route ?? null;
      ed.setEdgeIntent(e.id, intent);
      ed.renderEdge(e.id, 'badge' in f ? f.badge : undefined);
      touchedEdges.add(e.id);
      changedEdges.push(e.ref);
      refresh();
      continue;
    }
    const n = view.byId.get(op.ref);
    if (!n) {
      bad(op.path, `unknown node "${op.ref}"`);
      continue;
    }
    const kind = f.kind ?? (n.kind === 'raw' ? undefined : n.kind);
    if (!kind) {
      if (Object.keys(f).some((k) => k !== 'title' && k !== 'id')) {
        bad(op.path, `"${op.ref}" is a cell that dgm does not style. Set kind first, for example kind: card`);
        continue;
      }
    }
    const subNow = 'sub' in f ? f.sub : n.sub;
    if (kind && subNow && !SUB_KINDS.includes(kind) && 'sub' in f) bad(`${op.path}.sub`, `kind ${kind} has no subtitle`);
    const iconNow = 'icon' in f ? f.icon : n.icon;
    if (kind && iconNow && !ICON_KINDS.includes(kind)) bad(`${op.path}.icon`, `kind ${kind} has no icon`);
    if (f.id && f.id !== op.ref && doc.has(f.id)) bad(`${op.path}.id`, `id "${f.id}" exists`);
    if (problems.length) continue;
    let c = doc.get(op.ref)!;
    if (f.kind) {
      if (n.kind === 'raw') doc.setLabel(c, toHtmlLabel(fromHtmlLabel(doc.label(c))));
      c = doc.setAttr(c, A.kind, f.kind);
    }
    if ('title' in f) doc.setLabel(c, toHtmlLabel(f.title ?? ''));
    if ('tone' in f) c = doc.setAttr(c, A.tone, f.tone ?? undefined);
    if ('icon' in f) c = doc.setAttr(c, A.icon, f.icon ?? undefined);
    if ('variant' in f) c = doc.setAttr(c, A.variant, f.variant ?? undefined);
    if ('style' in f) c = doc.setAttr(c, A.style, serializeOverride(f.style ?? undefined));
    if (kind && !SUB_KINDS.includes(kind) && n.sub !== undefined) f.sub = null;
    let id = op.ref;
    if (f.id && f.id !== op.ref) {
      renameNode(doc, op.ref, f.id);
      renamed.set(f.id, renamed.get(op.ref) ?? op.ref);
      id = f.id;
    }
    if (kind) ed.renderTree(id, 'sub' in f ? f.sub : undefined);
    changedNodes.push(id);
    refresh();
  }

  // ---- connect
  let connected = 0;
  for (const e of ops.connect) {
    const missing = [e.from, e.to, ...viaIds(e)].filter((x) => !view.byId.has(x));
    if (missing.length) {
      for (const m of missing) bad(e.path, `unknown node "${m}"`);
      continue;
    }
    touchedEdges.add(ed.insertEdge(e));
    connected++;
  }
  refresh();

  // ---- move
  const moved: string[] = [];
  for (const m of ops.move) {
    const n = view.byId.get(m.id);
    if (!n) {
      bad(m.path, `unknown node "${m.id}"`);
      continue;
    }
    const target = m.in ?? n.parent;
    if (target !== 'page') {
      if (!isZone(target)) {
        bad(`${m.path}.in`, view.byId.has(target) ? `"${target}" is not a zone` : `unknown zone "${target}"`);
        continue;
      }
      if (isInside(target, m.id)) {
        bad(`${m.path}.in`, `cannot move "${m.id}" into itself`);
        continue;
      }
    }
    const c = doc.get(m.id)!;
    let pos: { x: number; y: number } = { x: n.geo.x, y: n.geo.y };
    if (m.at) pos = { x: m.at[0], y: m.at[1] };
    else if (target !== n.parent) {
      pos =
        target === 'page'
          ? placeBelow(theme, boxes('page', m.id))
          : placeInZone(theme, view.byId.get(target)!.geo, boxes(target, m.id), { w: n.geo.w, h: n.geo.h }, n.kind);
    }
    if (target !== n.parent) doc.setParent(c, target === 'page' ? layer : target);
    doc.setGeometry(c, { ...n.geo, ...pos });
    refresh();
    if (target !== 'page') growZone(target);
    moved.push(m.id);
  }

  // ---- remove
  const removedNodes: string[] = [];
  let removedEdges = 0;
  const removeEdge = (id: string) => {
    for (const c of doc.cells()) if (doc.parentId(c) === id) doc.removeCell(c);
    const c = doc.get(id);
    if (c) doc.removeCell(c);
    removedEdges++;
  };
  for (const r of ops.remove) {
    if (r.ref.includes('->')) {
      const e = findEdge(view, r.ref);
      if (!e) bad(r.path, `unknown edge "${r.ref}"`);
      else removeEdge(e.id);
      refresh();
      continue;
    }
    if (!view.byId.has(r.ref)) {
      const e = view.edges.find((x) => x.id === r.ref);
      if (e) removeEdge(e.id);
      else bad(r.path, `unknown node "${r.ref}"`);
      refresh();
      continue;
    }
    const gone = new Set<string>([r.ref]);
    let grew = true;
    const cells = doc.cells();
    while (grew) {
      grew = false;
      for (const c of cells) {
        if (!gone.has(c.id) && gone.has(doc.parentId(c) ?? '') && !doc.isEdge(c)) {
          gone.add(c.id);
          grew = true;
        }
      }
    }
    for (const c of cells) {
      if (doc.isEdge(c) && (gone.has(doc.source(c) ?? '') || gone.has(doc.target(c) ?? ''))) removeEdge(c.id);
    }
    for (const id of gone) {
      const c = doc.get(id);
      if (c) doc.removeCell(c);
      if (view.byId.has(id)) removedNodes.push(id);
    }
    refresh();
  }

  if (problems.length) throw new ValidationError(problems);

  // ---- style rules and routes
  const grouped = ed.groupText();
  ed.routeAll({ force: touchedEdges });
  refresh();

  // ---- overlaps after zone growth
  for (const z of grown) {
    const n = view.byId.get(z);
    if (!n) continue;
    for (const s of boxes(n.parent, z)) {
      if (overlap(n.geo, s)) warnings.push(`warning: zone ${z} grew and now overlaps ${s.id}. Run dgm layout to place all nodes again.`);
    }
  }

  // ---- summary
  const lines: string[] = [];
  const nodesLine = (sign: string, ids: string[]) => {
    if (ids.length) lines.push(`${sign}${plural(ids.length, 'node')}: ${ids.join(', ')}`);
  };
  nodesLine('+', added);
  if (connected) lines.push(`+${plural(connected, 'edge')}`);
  nodesLine('~', [...new Set(changedNodes)]);
  if (changedEdges.length) lines.push(`~${plural(changedEdges.length, 'edge')}: ${changedEdges.join(', ')}`);
  if (moved.length) lines.push(`moved ${plural(moved.length, 'node')}: ${moved.join(', ')}`);
  nodesLine('-', removedNodes);
  if (removedEdges) lines.push(`-${plural(removedEdges, 'edge')}`);
  let keptInPlace = 0;
  for (const n of view.nodes) {
    const old = before.get(renamed.get(n.id) ?? n.id);
    if (old && !moved.includes(n.id) && old.x === n.geo.x && old.y === n.geo.y) keptInPlace++;
  }
  lines.push(`${plural(keptInPlace, 'node')} kept in place`);
  if (grouped.length) lines.push(`grouped text: ${grouped.join(', ')}`);
  if (kept.length) lines.push(`kept the route that a person changed: ${kept.join(', ')}`);
  return { lines, warnings };
}

/** Store the routes that a person changed as the edge intent (exact points and ports). Returns the edge references. */
export function keepPersonRoutes(doc: DrawioDoc, ed: Editor, routes: Map<string, PersonRoute> | undefined, skip: Set<string> = new Set()): string[] {
  const view = readView(doc);
  const refs: string[] = [];
  for (const [id, pr] of routes ?? []) {
    const e = view.edges.find((x) => x.id === id);
    if (!e || !e.kind || skip.has(id)) continue;
    const parent = doc.parentId(e.cell);
    const off = parent ? absBoxes(doc).get(parent) : undefined;
    ed.setEdgeIntent(id, {
      via: pr.points.map(([x, y]) => ({ kind: 'point' as const, x: x + (off?.x ?? 0), y: y + (off?.y ?? 0) })),
      ...(pr.exit ? { fromPort: portFromFraction(pr.exit) ?? null } : {}),
      ...(pr.entry ? { toPort: portFromFraction(pr.entry) ?? null } : {}),
    });
    refs.push(e.ref);
  }
  return refs;
}

function renameNode(doc: DrawioDoc, from: string, to: string): void {
  const c = doc.get(from)!;
  doc.rename(c, to);
  for (const x of doc.cells()) {
    if (doc.parentId(x) === from) {
      doc.setParent(x, to);
      if (doc.attr(x, A.role) && x.id.startsWith(`${from}.`)) doc.rename(x, `${to}${x.id.slice(from.length)}`);
    }
    if (doc.isEdge(x)) {
      if (doc.source(x) === from) x.cell.setAttribute('source', to);
      if (doc.target(x) === from) x.cell.setAttribute('target', to);
    }
  }
}

export async function apply(io: IO, file: string, opts: { from?: string }): Promise<number> {
  const { path, doc, theme } = loadDiagram(io, file);
  const ops = parseApply(readYaml(await readInput(io, opts.from)), theme);
  const human = pending(path, doc);
  const res = executeApply(doc, theme, ops, { personRoutes: personRoutes(path, doc) });
  if (human && human.diff.lines.length) record(path, 'human', human.snap, summarize(human.diff));
  writeDoc(path, doc);
  const entry = record(path, 'agent', snapshot(doc), `apply: ${res.lines.filter((l) => !l.endsWith('kept in place')).join('; ') || 'no change'}`);
  io.out(`${file} (${entry.id})`);
  for (const l of res.lines) io.out(l);
  for (const w of res.warnings) io.out(w);
  const problems = checkDoc(doc, theme);
  for (const l of formatCheck(problems, layoutHints(doc, theme))) io.out(l);
  return problems.length ? EXIT.problems : EXIT.ok;
}
