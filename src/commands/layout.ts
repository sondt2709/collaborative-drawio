import { checkDoc, formatCheck, layoutHints } from '../check.js';
import { Editor, type DiagramView, type NodeInfo } from '../diagram.js';
import { EXIT } from '../errors.js';
import { layoutDiagram, type LNode } from '../layout/layout.js';
import { ackHuman, agentPlacements, personRoutes, record, snapshot } from '../track/track.js';
import { keepPersonRoutes } from './apply.js';
import { loadDiagram, plural, writeDoc, type IO } from './common.js';

/** Build layout input from the current diagram. Nodes in `keep` keep their position. */
export function viewToLNodes(view: DiagramView, keep: Set<string>): LNode[] {
  const build = (parent: string): LNode[] =>
    view.nodes
      .filter((n) => n.parent === parent)
      .map((n: NodeInfo) => {
        const l: LNode = {
          id: n.id,
          kind: n.kind,
          title: n.title,
          sub: n.sub,
          icon: n.icon,
          style: n.style,
          children: build(n.id),
        };
        if (n.kind === 'raw') l.size = [n.geo.w, n.geo.h];
        if (keep.has(n.id)) {
          l.at = [n.geo.x, n.geo.y];
          if (n.kind !== 'zone') l.size = [n.geo.w, n.geo.h];
        }
        // Children of a raw cell stay where they are.
        if (n.kind === 'raw') for (const c of l.children) c.at ??= [view.byId.get(c.id)!.geo.x, view.byId.get(c.id)!.geo.y];
        return l;
      });
  return build('page');
}

export async function layout(io: IO, file: string, opts: { keepMoved?: boolean }): Promise<number> {
  const { path, doc, theme, view } = loadDiagram(io, file);
  const routes = personRoutes(path, doc);
  const human = ackHuman(path, doc);
  if (human) io.out(`recorded human changes: ${human.lines.length} line${human.lines.length > 1 ? 's' : ''}`);
  const keep = new Set<string>();
  if (opts.keepMoved) {
    // A node that a person moved: its position differs from where dgm placed it last.
    const placed = agentPlacements(path);
    for (const n of view.nodes) {
      const p = placed.get(n.id);
      if (!p || Math.abs(p[0] - n.geo.x) >= 1 || Math.abs(p[1] - n.geo.y) >= 1) keep.add(n.id);
    }
  }
  const res = await layoutDiagram(theme, {
    title: view.title,
    subtitle: view.subtitle,
    direction: view.direction,
    nodes: viewToLNodes(view, keep),
    edges: view.edges.filter((e) => view.byId.has(e.from) && view.byId.has(e.to)),
  });
  const ed = new Editor(doc, theme);
  let moved = 0;
  for (const n of view.nodes) {
    const g = res.geo.get(n.id);
    if (!g) continue;
    const c = doc.get(n.id)!;
    const old = doc.geometry(c);
    if (!old || old.x !== g.x || old.y !== g.y || old.w !== g.w || old.h !== g.h) {
      doc.setGeometry(c, g);
      moved++;
    }
    ed.renderNode(n.id);
  }
  ed.setTitles(view.title, view.subtitle, res.title, res.subtitle);
  const grouped = ed.groupText();
  const kept = keepPersonRoutes(doc, ed, routes);
  ed.routeAll({ includeLegacy: true });
  writeDoc(path, doc);
  const entry = record(path, 'agent', snapshot(doc), `layout: ${plural(moved, 'node')} placed again${keep.size ? `, ${keep.size} kept` : ''}`);
  io.out(`${file}: ${plural(moved, 'node')} placed again${keep.size ? `, ${plural(keep.size, 'moved node')} kept: ${[...keep].join(', ')}` : ''} (${entry.id})`);
  if (grouped.length) io.out(`grouped text: ${grouped.join(', ')}`);
  if (kept.length) io.out(`kept the route that a person changed: ${kept.join(', ')}`);
  const problems = checkDoc(doc, theme);
  for (const l of formatCheck(problems, layoutHints(doc, theme))) io.out(l);
  return problems.length ? EXIT.problems : EXIT.ok;
}
