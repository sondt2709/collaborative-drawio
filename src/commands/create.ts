import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import { checkDoc, formatCheck, layoutHints } from '../check.js';
import { A, Editor } from '../diagram.js';
import { parseDiagram, readYaml, themeNameOf, type DiagramSpec, type NodeSpec } from '../dsl/parse.js';
import { DgmError, EXIT } from '../errors.js';
import { layoutDiagram } from '../layout/layout.js';
import { DrawioDoc } from '../model/doc.js';
import { loadTheme, type Theme } from '../theme/theme.js';
import { record, snapshot } from '../track/track.js';
import { abs, plural, readInput, specToLNode, writeDoc, type IO } from './common.js';

function count(nodes: NodeSpec[]): number {
  return nodes.reduce((s, n) => s + 1 + count(n.children), 0);
}

/** Build a new document from a validated create document. */
export async function buildDiagram(spec: DiagramSpec, theme: Theme, pageName: string): Promise<DrawioDoc> {
  const doc = DrawioDoc.create(spec.title ?? pageName);
  doc.setPageAttr(A.theme, spec.theme);
  if (spec.direction !== 'down') doc.setPageAttr(A.direction, spec.direction);
  const lay = await layoutDiagram(theme, {
    title: spec.title,
    subtitle: spec.subtitle,
    direction: spec.direction,
    nodes: spec.nodes.map(specToLNode),
    edges: spec.edges,
  });
  const ed = new Editor(doc, theme);
  ed.setTitles(spec.title, spec.subtitle, lay.title, lay.subtitle);
  for (const n of spec.nodes) ed.insertNode(n, '1', lay.geo);
  for (const e of spec.edges) ed.insertEdge(e);
  ed.groupText();
  ed.routeAll({ includeLegacy: true });
  return doc;
}

export async function create(io: IO, file: string, opts: { force?: boolean; from?: string }): Promise<number> {
  const path = abs(io, file);
  const raw = readYaml(await readInput(io, opts.from));
  const theme = loadTheme(themeNameOf(raw), path, io.env);
  const spec = parseDiagram(raw, theme);
  if (existsSync(path) && !opts.force) throw new DgmError(`${file} exists. Use dgm apply to change it, or --force to replace it.`);
  const doc = await buildDiagram(spec, theme, basename(file).replace(/\.drawio$/, ''));
  writeDoc(path, doc);
  const summary = `create: ${plural(count(spec.nodes), 'node')}, ${plural(spec.edges.length, 'edge')}`;
  const entry = record(path, 'agent', snapshot(doc), summary);
  io.out(`${file}: ${plural(count(spec.nodes), 'node')}, ${plural(spec.edges.length, 'edge')}, theme ${theme.name} (${entry.id})`);
  const problems = checkDoc(doc, theme);
  for (const l of formatCheck(problems, layoutHints(doc, theme))) io.out(l);
  return problems.length ? EXIT.problems : EXIT.ok;
}
