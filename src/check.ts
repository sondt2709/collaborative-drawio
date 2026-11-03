import { A } from './diagram.js';
import type { Cell, DrawioDoc } from './model/doc.js';
import { fromHtmlLabel } from './model/text.js';
import { getStyle, hasBase, parseStyle } from './model/style.js';
import { contrast, invertLightness, isRawColor, namedToHex, parseLightDark } from './theme/color.js';
import type { Theme } from './theme/theme.js';

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
  if (pair) return namedToHex(pair[mode]) ?? pair[mode];
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

export function formatCheck(problems: Problem[]): string[] {
  if (!problems.length) return ['check: ok'];
  return [`check: ${problems.length} problem${problems.length > 1 ? 's' : ''}`, ...problems.map((p) => `  ${p.id}: ${p.message}`)];
}
