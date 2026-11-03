import { A, absBoxes, edgeLines, floatingTexts, obstacles, readView } from './diagram.js';
import { labelBoxOf } from './route/label.js';
import { contains, crossedBoxes, segmentsCross, type Pt } from './route/geom.js';
import type { Cell, DrawioDoc } from './model/doc.js';
import { fromHtmlLabel } from './model/text.js';
import { getStyle, hasBase, parseStyle } from './model/style.js';
import { contrast, invertLightness, isRawColor, namedToHex, parseLightDark } from './theme/color.js';
import type { Theme } from './theme/theme.js';

export { edgeLines };

export interface Problem {
  id: string;
  message: string;
}

const COLOR_KEYS = ['fillColor', 'strokeColor', 'fontColor', 'labelBackgroundColor', 'labelBorderColor', 'gradientColor', 'swimlaneFillColor'];

type Mode = 0 | 1; // 0 light, 1 dark

/** The color that draw.io shows for a style value, or undefined for "none". */
function resolve(v: string | undefined, mode: Mode, dflt: [string, string] | undefined): string | undefined {
  if (v === undefined || v === '' || v.toLowerCase() === 'default') return dflt?.[mode];
  if (v.toLowerCase() === 'none') return undefined;
  const pair = parseLightDark(v);
  if (pair) return pair[mode].toLowerCase() === 'none' ? undefined : (namedToHex(pair[mode]) ?? pair[mode]);
  const hex = namedToHex(v);
  if (!hex) return dflt?.[mode];
  // adaptiveColors="auto" changes plain colors in dark mode.
  return mode === 1 ? invertLightness(hex) : hex;
}

/** Report raw colors and text with low contrast, in light and dark mode. */
export function checkDoc(doc: DrawioDoc, theme: Theme): Problem[] {
  const problems: Problem[] = [];
  const cells = doc.cells();
  const byId = new Map(cells.map((c) => [c.id, c]));
  const page = theme.page.background;

  const fillOf = (c: Cell | undefined, mode: Mode, depth = 0): string => {
    if (!c || depth > 30 || c.id === '0' || doc.parentId(c) === '0') return page[mode];
    const st = doc.style(c);
    if (doc.isVertex(c)) {
      const isText = hasBase(st, 'text') || hasBase(st, 'edgeLabel');
      const f = getStyle(st, 'fillColor');
      const fill = resolve(f, mode, isText ? undefined : ['#FFFFFF', page[1]]);
      if (fill && !(st.includes('shape=stencil(') && !f)) return fill;
    }
    return fillOf(byId.get(doc.parentId(c) ?? ''), mode, depth + 1);
  };

  for (const c of cells) {
    const st = doc.style(c);
    const who = ownerName(doc, c, byId);
    for (const [k, v] of parseStyle(st)) {
      if (v !== null && COLOR_KEYS.includes(k) && isRawColor(v)) {
        problems.push({ id: who, message: `raw color ${k}=${v}. Use a tone or a kind; plain colors change in dark mode` });
      }
    }
    const text = fromHtmlLabel(doc.label(c));
    if (!text || (!doc.isVertex(c) && !doc.isEdge(c))) continue;
    const size = Number(getStyle(st, 'fontSize') ?? 12);
    const bold = (Number(getStyle(st, 'fontStyle') ?? 0) & 1) === 1;
    const need = bold && size >= 14 ? 3 : 4.5;
    for (const mode of [0, 1] as Mode[]) {
      const fg = resolve(getStyle(st, 'fontColor'), mode, ['#000000', '#FFFFFF']);
      let bg: string;
      if (doc.isEdge(c)) bg = resolve(getStyle(st, 'labelBackgroundColor'), mode, undefined) ?? page[mode];
      else bg = fillOf(c, mode);
      if (!fg) continue;
      const ratio = contrast(fg, bg);
      if (ratio < need) {
        problems.push({
          id: who,
          message: `contrast ${ratio.toFixed(2)} in ${mode ? 'dark' : 'light'} mode (text ${fg} on ${bg}), needs ${need}`,
        });
      }
    }
  }
  return problems;
}

function ownerName(doc: DrawioDoc, c: Cell, byId: Map<string, Cell>): string {
  if (doc.attr(c, A.role) && doc.attr(c, A.role) !== 'title' && doc.attr(c, A.role) !== 'subtitle') {
    const p = byId.get(doc.parentId(c) ?? '');
    if (p) return `${p.id} (${doc.attr(c, A.role)})`;
  }
  return c.id;
}

/** Layout hints: lines through boxes, almost straight lines, line crossings, floating text. They do not change the exit code. */
export function layoutHints(doc: DrawioDoc, theme: Theme): string[] {
  const view = readView(doc);
  const boxes = absBoxes(doc);
  const obs = obstacles(doc, view, boxes, theme);
  const hints: string[] = [];
  const lines = edgeLines(doc);
  for (const l of lines) {
    const a = boxes.get(l.from)!;
    const b = boxes.get(l.to)!;
    const own = obs.filter((o) => o.id !== l.from && o.id !== l.to && !contains(o.box, a) && !contains(o.box, b));
    // A line on a box border looks as bad as a line through the box: count 2 px around it.
    const hit = crossedBoxes(l.line, own, -2);
    if (hit.length) hints.push(`hint: edge ${l.ref} crosses ${hit.join(', ')}`);
    for (let i = 0; i + 1 < l.line.length; i++) {
      const dx = Math.abs(l.line[i + 1][0] - l.line[i][0]);
      const dy = Math.abs(l.line[i + 1][1] - l.line[i][1]);
      const off = Math.min(dx, dy);
      const len = Math.max(dx, dy);
      if (off >= 1 && off / len < Math.tan((4 * Math.PI) / 180)) {
        hints.push(`hint: edge ${l.ref} is almost ${dx > dy ? 'horizontal' : 'vertical'} (off by ${Math.round(off)} px). Align the boxes or set ports`);
        break;
      }
    }
  }
  let crossings = 0;
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const A2 = lines[i].line;
      const B2 = lines[j].line;
      for (let s = 0; s + 1 < A2.length; s++) for (let t = 0; t + 1 < B2.length; t++) if (segmentsCross(A2[s], A2[s + 1], B2[t], B2[t + 1])) crossings++;
    }
  }
  if (crossings) hints.push(`hint: ${crossings} line crossing${crossings > 1 ? 's' : ''}`);
  for (const l of lines) {
    const e = view.edges.find((x) => x.id === l.id);
    const text = e && fromHtmlLabel(doc.label(e.cell));
    if (!e || !text) continue;
    const pos = doc.edgeLabelPos(e.cell);
    const b = labelBoxOf(l.line, text, pos.x, pos.offset);
    const on = obs.filter((o) => b.x < o.box.x + o.box.w && o.box.x < b.x + b.w && b.y < o.box.y + o.box.h && o.box.y < b.y + b.h).map((o) => o.id);
    if (on.length) hints.push(`hint: label ${JSON.stringify(text)} of edge ${l.ref} overlaps ${on.join(', ')}. Shorten the label, or run dgm layout`);
  }
  for (const [t, z] of floatingTexts(doc, view)) hints.push(`hint: text ${t} sits on zone ${z} but is not part of it (dgm apply moves it into the zone)`);
  return hints;
}

export function formatCheck(problems: Problem[], hints: string[] = []): string[] {
  const head = problems.length ? [`check: ${problems.length} problem${problems.length > 1 ? 's' : ''}`, ...problems.map((p) => `  ${p.id}: ${p.message}`)] : ['check: ok'];
  return [...head, ...hints];
}
