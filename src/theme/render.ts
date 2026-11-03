import { iconStencil } from '../icons/index.js';
import { buildStyle } from '../model/style.js';
import { contrast, ld, type LD } from './color.js';
import type { Routed, RouteStyle } from '../route/route.js';
import type { NodeKind, Theme } from './theme.js';

/** The `style` override of a node. Colors are tone names or semantic names, never raw colors. */
export interface StyleOverride {
  stroke?: string;
  fill?: string;
  text?: string;
  dashed?: boolean;
  bold?: boolean;
  width?: number;
  height?: number;
}

export const OVERRIDE_KEYS = ['stroke', 'fill', 'text', 'dashed', 'bold', 'width', 'height'] as const;

export function parseOverride(s: string | undefined): StyleOverride | undefined {
  if (!s) return undefined;
  const o: StyleOverride = {};
  for (const part of s.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === 'stroke' || k === 'fill' || k === 'text') o[k] = v;
    else if (k === 'dashed' || k === 'bold') o[k] = v === '1' || v === 'true';
    else if (k === 'width' || k === 'height') o[k] = Number(v);
  }
  return Object.keys(o).length ? o : undefined;
}

export function serializeOverride(o: StyleOverride | undefined): string | undefined {
  if (!o) return undefined;
  const parts: string[] = [];
  for (const k of OVERRIDE_KEYS) {
    const v = o[k];
    if (v === undefined) continue;
    parts.push(`${k}=${typeof v === 'boolean' ? (v ? 1 : 0) : v}`);
  }
  return parts.length ? parts.join(';') : undefined;
}

export interface NodeLook {
  kind: NodeKind;
  /** The effective tone (after inheritance). */
  tone: string;
  icon?: string;
  variant?: string;
  style?: StyleOverride;
  hasSub: boolean;
}

export interface HelperLook {
  suffix: 'icon' | 'sub';
  role: 'icon' | 'sub';
  style: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Rendered {
  style: string;
  helpers: HelperLook[];
}

const HELPER = 'connectable=0;movable=0;resizable=0;rotatable=0;';

/**
 * Style rule: a container fill that looks like the page background in a mode
 * is written as "none" in that mode.
 */
export function containerFill(theme: Theme, fill: LD): string {
  const t = theme.rules.containerThreshold;
  const parts = fill.map((c, i) => (contrast(c, theme.page.background[i]) < t[i] ? 'none' : c));
  if (parts[0] === 'none' && parts[1] === 'none') return 'none';
  return `light-dark(${parts[0]},${parts[1]})`;
}

function colorOf(theme: Theme, tone: string, name: string, part: 'accent' | 'tint'): LD {
  if (theme.tones[name]) return theme.tones[name][part];
  const t = theme.tones[tone] ?? theme.tones[theme.defaultTone];
  if (name === 'accent') return t.accent;
  if (name === 'tint') return t.tint;
  if (name === 'surface' || name === 'ink' || name === 'muted') return theme.colors[name];
  return t[part];
}

function iconStyle(name: string, stroke: LD, width = 1.8): string {
  return `shape=${iconStencil(name)};html=1;aspect=fixed;fillColor=none;strokeColor=${ld(stroke)};strokeWidth=${width};editable=0;${HELPER}`;
}

/** The style of a node cell and its helper cells, for a node of size w x h. */
export function renderNode(theme: Theme, n: NodeLook, w: number, h: number): Rendered {
  const tone = theme.tones[n.tone] ?? theme.tones[theme.defaultTone];
  const c = theme.colors;
  const o = n.style ?? {};
  const muted = n.variant === 'muted';
  const emphasis = n.variant === 'emphasis';
  const dashed = o.dashed ?? n.variant === 'dashed';
  const dash: Array<[string, string | number | undefined]> = dashed ? [['dashed', 1], ['dashPattern', '6 4']] : [];
  let stroke = o.stroke ? colorOf(theme, n.tone, o.stroke, 'accent') : muted ? c.muted : tone.accent;
  const textOver = o.text ? colorOf(theme, n.tone, o.text, 'accent') : undefined;
  const fillOver = o.fill ? colorOf(theme, n.tone, o.fill, 'tint') : undefined;
  const bold = (dflt: boolean) => ((o.bold ?? dflt) ? 1 : 0);
  const strokeWidth = emphasis ? 2.4 : 1.4;
  const helpers: HelperLook[] = [];
  const s = theme.sizes;

  switch (n.kind) {
    case 'card': {
      const left = n.icon ? 50 : 14;
      if (n.icon) helpers.push({ suffix: 'icon', role: 'icon', style: iconStyle(n.icon, stroke), x: 14, y: Math.round((h - 26) / 2), w: 26, h: 26 });
      if (n.hasSub) {
        helpers.push({
          suffix: 'sub',
          role: 'sub',
          style: buildStyle(['text', ['html', 1], ['whiteSpace', 'wrap'], ['fontSize', s.card.subFontSize], ['fontColor', ld(c.muted)], ['align', 'left'], ['verticalAlign', 'top'], ['spacing', 0], ['fillColor', 'none'], ['strokeColor', 'none'], ['fontFamily', theme.font]]) + HELPER,
          x: left,
          y: 30,
          w: Math.max(20, w - left - 8),
          h: Math.max(14, h - 34),
        });
      }
      return {
        style: buildStyle([
          ['rounded', 1], ['arcSize', 10], ['absoluteArcSize', 1], ['html', 1], ['whiteSpace', 'wrap'],
          ['fillColor', ld(fillOver ?? (emphasis ? tone.tint : c.surface))], ['strokeColor', ld(stroke)], ['strokeWidth', strokeWidth], ...dash,
          ['align', 'left'], ['verticalAlign', n.hasSub ? 'top' : 'middle'], ['spacing', 0], ['spacingLeft', left], ['spacingRight', 8], ['spacingTop', n.hasSub ? 10 : 0],
          ['fontSize', s.card.fontSize], ['fontStyle', bold(true)], ['fontColor', ld(textOver ?? (muted ? c.muted : c.ink))], ['fontFamily', theme.font],
        ]),
        helpers,
      };
    }
    case 'cylinder': {
      if (n.icon) helpers.push({ suffix: 'icon', role: 'icon', style: iconStyle(n.icon, stroke), x: Math.round(w / 2 - 12), y: 34, w: 24, h: 24 });
      if (n.hasSub) {
        helpers.push({
          suffix: 'sub',
          role: 'sub',
          style: buildStyle(['text', ['html', 1], ['whiteSpace', 'wrap'], ['fontSize', s.cylinder.subFontSize], ['fontColor', ld(c.muted)], ['align', 'center'], ['verticalAlign', 'top'], ['spacing', 0], ['fillColor', 'none'], ['strokeColor', 'none'], ['fontFamily', theme.font]]) + HELPER,
          x: 10,
          y: n.icon ? 88 : 64,
          w: Math.max(20, w - 20),
          h: Math.max(14, h - (n.icon ? 98 : 74)),
        });
      }
      return {
        style: buildStyle([
          ['shape', 'cylinder3'], ['size', 14], ['html', 1], ['whiteSpace', 'wrap'],
          ['fillColor', ld(fillOver ?? (emphasis ? tone.tint : c.surface))], ['strokeColor', ld(stroke)], ['strokeWidth', strokeWidth], ...dash,
          ['align', 'center'], ['verticalAlign', 'top'], ['spacing', 0], ['spacingLeft', 8], ['spacingRight', 8], ['spacingTop', n.icon ? 64 : 40],
          ['fontSize', s.cylinder.fontSize], ['fontStyle', bold(true)], ['fontColor', ld(textOver ?? c.ink)], ['fontFamily', theme.font],
        ]),
        helpers,
      };
    }
    case 'zone': {
      if (n.icon) helpers.push({ suffix: 'icon', role: 'icon', style: iconStyle(n.icon, textOver ?? stroke, 1.6), x: 16, y: 11, w: 16, h: 16 });
      return {
        style: buildStyle([
          ['rounded', 1], ['arcSize', 8], ['absoluteArcSize', 1], ['html', 1], ['whiteSpace', 'wrap'],
          ['fillColor', dashed && !fillOver ? 'none' : containerFill(theme, fillOver ?? tone.tint)], ['strokeColor', ld(stroke)], ['strokeWidth', strokeWidth], ...dash,
          ['container', 1], ['collapsible', 0], ['recursiveResize', 0],
          ['align', 'left'], ['verticalAlign', 'top'], ['spacing', 0], ['spacingLeft', n.icon ? 38 : 16], ['spacingTop', 12], ['spacingRight', 16],
          ['fontSize', s.zone.fontSize], ['fontStyle', bold(true)], ['fontColor', ld(textOver ?? (muted ? c.muted : tone.accent))], ['fontFamily', theme.font],
        ]),
        helpers,
      };
    }
    case 'chip': {
      if (n.icon) helpers.push({ suffix: 'icon', role: 'icon', style: iconStyle(n.icon, stroke, 1.6), x: 9, y: Math.round((h - 15) / 2), w: 15, h: 15 });
      return {
        style: buildStyle([
          ['rounded', 1], ['arcSize', 8], ['absoluteArcSize', 1], ['html', 1], ['whiteSpace', 'wrap'],
          ['fillColor', ld(fillOver ?? (emphasis ? tone.tint : c.surface))], ['strokeColor', ld(stroke)], ['strokeWidth', emphasis ? 2 : 1.2], ...dash,
          ['align', 'center'], ['verticalAlign', 'middle'], ['spacing', 0], ['spacingLeft', n.icon ? 22 : 0],
          ['fontSize', s.chip.fontSize], ['fontStyle', bold(true)], ['fontColor', ld(textOver ?? (muted ? c.muted : c.ink))], ['fontFamily', theme.font],
        ]),
        helpers,
      };
    }
    case 'band': {
      const fg = textOver ?? c.onSolid;
      if (n.icon) helpers.push({ suffix: 'icon', role: 'icon', style: iconStyle(n.icon, fg), x: 14, y: Math.round((h - 16) / 2), w: 16, h: 16 });
      return {
        style: buildStyle([
          ['rounded', 1], ['arcSize', 6], ['absoluteArcSize', 1], ['html', 1], ['whiteSpace', 'wrap'],
          ['fillColor', ld(fillOver ?? (muted ? theme.tones.slate?.solid ?? tone.solid : tone.solid))], ['strokeColor', o.stroke ? ld(stroke) : 'none'], ...dash,
          ['align', 'left'], ['verticalAlign', 'middle'], ['spacing', 0], ['spacingLeft', n.icon ? 40 : 14], ['spacingRight', 14],
          ['fontSize', s.band.fontSize], ['fontStyle', bold(true)], ['fontColor', ld(fg)], ['fontFamily', theme.font],
        ]),
        helpers,
      };
    }
    case 'note':
      return {
        style: buildStyle([
          'text', ['html', 1], ['whiteSpace', 'wrap'], ['fillColor', fillOver ? ld(fillOver) : 'none'], ['strokeColor', 'none'],
          ['align', 'left'], ['verticalAlign', 'middle'], ['spacing', 0],
          ['fontSize', s.note.fontSize], ['fontStyle', o.bold ? 3 : 2], ['fontColor', ld(textOver ?? c.muted)], ['fontFamily', theme.font],
        ]),
        helpers,
      };
    case 'text':
      return {
        style: buildStyle([
          'text', ['html', 1], ['whiteSpace', 'wrap'], ['fillColor', fillOver ? ld(fillOver) : 'none'], ['strokeColor', 'none'],
          ['align', 'left'], ['verticalAlign', 'middle'], ['spacing', 0],
          ['fontSize', s.text.fontSize], ['fontStyle', bold(false)], ['fontColor', ld(textOver ?? (muted ? c.muted : c.ink))], ['fontFamily', theme.font],
        ]),
        helpers,
      };
  }
}

export function titleStyle(theme: Theme): string {
  return buildStyle([
    'text', ['html', 1], ['fillColor', 'none'], ['strokeColor', 'none'], ['align', 'left'], ['verticalAlign', 'top'], ['spacing', 0],
    ['fontSize', theme.sizes.title.fontSize], ['fontStyle', 1], ['fontColor', ld(theme.colors.ink)], ['fontFamily', theme.font],
  ]);
}

export function subtitleStyle(theme: Theme): string {
  return buildStyle([
    'text', ['html', 1], ['whiteSpace', 'wrap'], ['fillColor', 'none'], ['strokeColor', 'none'], ['align', 'left'], ['verticalAlign', 'top'], ['spacing', 0],
    ['fontSize', theme.sizes.title.subFontSize], ['fontColor', ld(theme.colors.muted)], ['fontFamily', theme.font],
  ]);
}

export interface EdgeLook {
  kind?: string;
  variant?: string;
  route?: RouteStyle;
}

export function edgeColor(theme: Theme, e: EdgeLook): LD {
  const k = theme.edges[e.kind ?? 'default'] ?? theme.edges.default;
  if (e.variant === 'muted') return theme.colors.muted;
  return (theme.tones[k.tone] ?? theme.tones[theme.defaultTone]).accent;
}

/** The style of an edge: straight by default, rounded corners, and the ports of the route. */
export function renderEdge(theme: Theme, e: EdgeLook, r?: Routed): string {
  const k = theme.edges[e.kind ?? 'default'] ?? theme.edges.default;
  const color = edgeColor(theme, e);
  const dashed = k.dashed || e.variant === 'dashed';
  const route = e.route ?? 'straight';
  return buildStyle([
    ...(route === 'orthogonal' ? ([['edgeStyle', 'orthogonalEdgeStyle']] as Array<[string, string]>) : []),
    ...(route === 'curved' ? ([['curved', 1]] as Array<[string, number]>) : []),
    ['rounded', 1], ['arcSize', theme.rules.edgeArcSize], ['html', 1], ['endArrow', 'block'], ['endFill', 1], ['endSize', 6],
    ['strokeWidth', k.width + (e.variant === 'emphasis' ? 1 : 0)], ['strokeColor', ld(color)],
    ...(dashed ? ([['dashed', 1], ['dashPattern', '6 4']] as Array<[string, string | number]>) : []),
    ['fontSize', 11], ['fontStyle', k.bold || e.variant === 'emphasis' ? 1 : 0], ['fontColor', ld(color)],
    ['labelBackgroundColor', ld(theme.colors.surface)], ['fontFamily', theme.font],
    ...(r?.exit ? ([['exitX', r.exit[0]], ['exitY', r.exit[1]], ['exitDx', 0], ['exitDy', 0]] as Array<[string, number]>) : []),
    ...(r?.entry ? ([['entryX', r.entry[0]], ['entryY', r.entry[1]], ['entryDx', 0], ['entryDy', 0]] as Array<[string, number]>) : []),
  ]);
}

export function renderBadge(theme: Theme, e: EdgeLook): string {
  const color = edgeColor(theme, e);
  return (
    buildStyle([
      'ellipse', ['html', 1], ['fillColor', ld(color)], ['strokeColor', 'none'],
      ['fontSize', 11], ['fontStyle', 1], ['fontColor', ld(theme.colors.onAccent)], ['fontFamily', theme.font],
    ]) + HELPER
  );
}
