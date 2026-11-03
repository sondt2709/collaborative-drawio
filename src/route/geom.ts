import type { Box } from './route.js';

export type Pt = [number, number];

/** True when segment p-q passes through the inside of box b (shrunk by `inset`). Liang-Barsky clipping. */
export function segmentHitsBox(p: Pt, q: Pt, b: Box, inset = 2): boolean {
  const x0 = b.x + inset;
  const y0 = b.y + inset;
  const x1 = b.x + b.w - inset;
  const y1 = b.y + b.h - inset;
  if (x1 <= x0 || y1 <= y0) return false;
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  let t0 = 0;
  let t1 = 1;
  const clip = (pp: number, qq: number): boolean => {
    if (pp === 0) return qq >= 0;
    const t = qq / pp;
    if (pp < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  if (!clip(-dx, p[0] - x0) || !clip(dx, x1 - p[0]) || !clip(-dy, p[1] - y0) || !clip(dy, y1 - p[1])) return false;
  return t1 - t0 > 1e-9;
}

/** True when the open segments a-b and c-d cross. */
export function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  const o1 = o(a, b, c);
  const o2 = o(a, b, d);
  const o3 = o(c, d, a);
  const o4 = o(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

/** The point where the line from the center of b toward `to` leaves b. */
export function borderPoint(b: Box, to: Pt): Pt {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const dx = to[0] - cx;
  const dy = to[1] - cy;
  if (!dx && !dy) return [cx, cy];
  const sx = dx ? b.w / 2 / Math.abs(dx) : Infinity;
  const sy = dy ? b.h / 2 / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return [cx + dx * s, cy + dy * s];
}

export function contains(outer: Box, inner: Box): boolean {
  return inner.x >= outer.x - 1 && inner.y >= outer.y - 1 && inner.x + inner.w <= outer.x + outer.w + 1 && inner.y + inner.h <= outer.y + outer.h + 1;
}

/** The boxes that a polyline passes through. */
export function crossedBoxes(line: Pt[], obstacles: Array<{ id: string; box: Box }>, inset = 2): string[] {
  const hit: string[] = [];
  for (const o of obstacles) {
    for (let i = 0; i + 1 < line.length; i++) {
      if (segmentHitsBox(line[i], line[i + 1], o.box, inset)) {
        hit.push(o.id);
        break;
      }
    }
  }
  return hit;
}
