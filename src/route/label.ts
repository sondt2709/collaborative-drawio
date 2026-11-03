/**
 * Edge label placement: find a point on the line (or beside it) where the
 * label box does not cover a box. All coordinates are page coordinates.
 */
import { lineWidth } from '../layout/text.js';
import { borderPoint, type Pt } from './geom.js';
import type { Box } from './route.js';

/** The font size of edge labels (see renderEdge). */
export const LABEL_FONT = 11;
/** The space that a label keeps from a box. */
const MARGIN = 2;
/** The size of the box that the arrowhead needs. */
const ARROW = 14;
/** The distance between two candidate points on the line. */
const STEP = 4;

/** The size of the label box: the text plus the label background padding. */
export function labelSize(text: string): { w: number; h: number } {
  const lines = text.split('\n');
  const w = Math.max(...lines.map((l) => lineWidth(l, LABEL_FONT)));
  return { w: Math.ceil(w + 8), h: lines.length * 14 + 4 };
}

/**
 * The full polyline of an edge: the source end, the points and the target
 * end. An end is the port (a fraction of the box) or the border point toward
 * the next point, as draw.io draws a floating end.
 */
export function edgePath(a: Box, b: Box, points: Pt[], exit?: Pt, entry?: Pt): Pt[] {
  const center = (x: Box): Pt => [x.x + x.w / 2, x.y + x.h / 2];
  const port = (x: Box, f?: Pt): Pt | undefined => (f ? [x.x + f[0] * x.w, x.y + f[1] * x.h] : undefined);
  const p1 = port(b, entry);
  const p0 = port(a, exit) ?? borderPoint(a, points[0] ?? p1 ?? center(b));
  const end = p1 ?? borderPoint(b, points[points.length - 1] ?? p0);
  return [p0, ...points, end];
}

export interface LabelPlace {
  /** draw.io geometry x: the position along the path, from -1 (source) to 1 (target). */
  x: number;
  /** The absolute offset of the label center from the path point. */
  offset: Pt;
  /** The label box on the page. */
  box: Box;
  /** false: no free position exists; the label is at the preferred point. */
  free: boolean;
}

const hits = (a: Box, b: Box): boolean =>
  a.x < b.x + b.w + MARGIN && b.x < a.x + a.w + MARGIN && a.y < b.y + b.h + MARGIN && b.y < a.y + a.h + MARGIN;

const r2 = (v: number) => Math.round(v * 100) / 100;

/** The box of a label of size `s` centered at `p`. */
export function boxAt(p: Pt, s: { w: number; h: number }): Box {
  return { x: p[0] - s.w / 2, y: p[1] - s.h / 2, w: s.w, h: s.h };
}

/**
 * The position of a label on `path`: the free point nearest to the middle of
 * the longest segment; then the same points with an offset beside the line;
 * then the middle of the longest segment.
 */
export function placeLabel(path: Pt[], size: { w: number; h: number }, obstacles: Box[], placed: Box[] = []): LabelPlace {
  const lens = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i][0], p[1] - path[i][1]));
  const total = lens.reduce((s, l) => s + l, 0);
  // Candidate points: [distance along the path, point, segment index].
  const cands: Array<{ d: number; p: Pt; seg: number }> = [];
  let start = 0;
  let longest = 0;
  for (let i = 0; i < lens.length; i++) {
    if (lens[i] > lens[longest]) longest = i;
    const n = Math.max(1, Math.floor(lens[i] / STEP));
    for (let k = 0; k <= n; k++) {
      const f = k / n;
      cands.push({ d: start + lens[i] * f, p: [path[i][0] + (path[i + 1][0] - path[i][0]) * f, path[i][1] + (path[i + 1][1] - path[i][1]) * f], seg: i });
    }
    start += lens[i];
  }
  const before = lens.slice(0, longest).reduce((s, l) => s + l, 0);
  const pref = before + lens[longest] / 2;
  const a = path[longest];
  const b = path[longest + 1];
  cands.push({ d: pref, p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], seg: longest });
  cands.sort((a, b) => Math.abs(a.d - pref) - Math.abs(b.d - pref) || a.d - b.d);
  // The arrowhead at the target end.
  const tip = path[path.length - 1];
  const blocked = [...obstacles, ...placed, { x: tip[0] - ARROW / 2, y: tip[1] - ARROW / 2, w: ARROW, h: ARROW }];
  const free = (b: Box) => !blocked.some((o) => hits(b, o));
  const result = (d: number, p: Pt, off: Pt, ok: boolean): LabelPlace => ({
    x: total ? r2((2 * d) / total - 1) : 0,
    offset: [r2(off[0]), r2(off[1])],
    box: boxAt([p[0] + off[0], p[1] + off[1]], size),
    free: ok,
  });
  for (const c of cands) if (free(boxAt(c.p, size))) return result(c.d, c.p, [0, 0], true);
  for (const c of cands) {
    const dx = Math.abs(path[c.seg + 1][0] - path[c.seg][0]);
    const dy = Math.abs(path[c.seg + 1][1] - path[c.seg][1]);
    const side = size.w / 2 + 6;
    const updown = size.h / 2 + 4;
    const offs: Pt[] = dy >= dx ? [[side, 0], [-side, 0]] : [[0, -updown], [0, updown]];
    for (const off of offs) {
      const b = boxAt([c.p[0] + off[0], c.p[1] + off[1]], size);
      if (free(b)) return result(c.d, c.p, off, true);
    }
  }
  // cands[0] is the point nearest to the preferred point.
  return result(cands[0].d, cands[0].p, [0, 0], false);
}

/** The page point at geometry x (-1..1) along a path. */
export function pointAlong(path: Pt[], x: number): Pt {
  const lens = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i][0], p[1] - path[i][1]));
  let rest = ((x + 1) / 2) * lens.reduce((s, l) => s + l, 0);
  for (let i = 0; i < lens.length; i++) {
    if (rest <= lens[i] || i === lens.length - 1) {
      const f = lens[i] ? Math.max(0, Math.min(1, rest / lens[i])) : 0;
      return [path[i][0] + (path[i + 1][0] - path[i][0]) * f, path[i][1] + (path[i + 1][1] - path[i][1]) * f];
    }
    rest -= lens[i];
  }
  return path[0];
}

/** The label box from a stored position (geometry x and the offset; the orthogonal y is not used). */
export function labelBoxOf(path: Pt[], text: string, x: number, offset: Pt): Box {
  const p = pointAlong(path, x);
  return boxAt([p[0] + offset[0], p[1] + offset[1]], labelSize(text));
}
