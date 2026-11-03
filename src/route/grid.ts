import { segmentHitsBox, type Pt } from './geom.js';
import type { Box, Side } from './route.js';

/** The length of a polyline that runs along a zone border or inside a band (within `tol` px). */
export function alongLength(line: Pt[], zones: Box[], tol: number): number {
  let total = 0;
  for (let i = 0; i + 1 < line.length; i++) {
    const p = line[i];
    const q = line[i + 1];
    const len = Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]);
    for (const z of zones) {
      if (Math.abs(p[1] - q[1]) < 0.5) {
        const near = Math.abs(p[1] - z.y) < tol || Math.abs(p[1] - (z.y + z.h)) < tol || (z.h < 60 && p[1] > z.y && p[1] < z.y + z.h);
        if (near && Math.max(p[0], q[0]) > z.x && Math.min(p[0], q[0]) < z.x + z.w) total += len;
      } else if (Math.abs(p[0] - q[0]) < 0.5) {
        const near = Math.abs(p[0] - z.x) < tol || Math.abs(p[0] - (z.x + z.w)) < tol;
        if (near && Math.max(p[1], q[1]) > z.y && Math.min(p[1], q[1]) < z.y + z.h) total += len;
      }
    }
  }
  return total;
}

/**
 * An orthogonal path from a side of box a to a side of box b that keeps
 * `margin` px away from the obstacles. A* on the grid of obstacle borders
 * (a Hanan grid) with a cost for each bend. Undefined when no path exists.
 */
export function gridPath(a: Box, b: Box, obstacles: Box[], margin: number, zones: Box[] = []): { fromSide: Side; toSide: Side; points: Pt[] } | undefined {
  const pad = 240;
  const area = {
    x0: Math.min(a.x, b.x) - pad,
    y0: Math.min(a.y, b.y) - pad,
    x1: Math.max(a.x + a.w, b.x + b.w) + pad,
    y1: Math.max(a.y + a.h, b.y + b.h) + pad,
  };
  const obs = obstacles.filter((o) => o.x < area.x1 && o.x + o.w > area.x0 && o.y < area.y1 && o.y + o.h > area.y0);
  const blocked = [...obs, a, b];
  const xs = new Set<number>();
  const ys = new Set<number>();
  for (const o of blocked) {
    xs.add(o.x - margin);
    xs.add(o.x + o.w + margin);
    ys.add(o.y - margin);
    ys.add(o.y + o.h + margin);
  }
  // Lines inside and outside each zone border, so a path can avoid running on the border.
  for (const z of zones) {
    for (const v of [z.x - margin, z.x + margin, z.x + z.w - margin, z.x + z.w + margin]) xs.add(v);
    for (const v of [z.y - margin, z.y + z.h - margin, z.y + z.h + margin]) ys.add(v);
  }
  // A segment that runs along a zone border costs more.
  const along = (p: Pt, q: Pt): number => alongLength([p, q], zones, margin / 2) * 2;
  const acx = a.x + a.w / 2;
  const acy = a.y + a.h / 2;
  const bcx = b.x + b.w / 2;
  const bcy = b.y + b.h / 2;
  for (const v of [acx, bcx]) xs.add(v);
  for (const v of [acy, bcy]) ys.add(v);
  const X = [...xs].filter((v) => v >= area.x0 && v <= area.x1).sort((p, q) => p - q);
  const Y = [...ys].filter((v) => v >= area.y0 && v <= area.y1).sort((p, q) => p - q);
  const inset = -(margin - 1);
  const free = (p: Pt, q: Pt) => !obs.some((o) => segmentHitsBox(p, q, o, inset));
  const insideEnd = (p: Pt) => [a, b].some((o) => p[0] > o.x - margin + 0.5 && p[0] < o.x + o.w + margin - 0.5 && p[1] > o.y - margin + 0.5 && p[1] < o.y + o.h + margin - 0.5);
  const key = (i: number, j: number) => i * Y.length + j;

  // Start: the stub point outside the middle of each side of a. Goal: the same for b.
  type Stub = { side: Side; port: Pt; out: Pt };
  const stubs = (o: Box, cxv: number, cyv: number): Stub[] => [
    { side: 't', port: [cxv, o.y], out: [cxv, o.y - margin] },
    { side: 'b', port: [cxv, o.y + o.h], out: [cxv, o.y + o.h + margin] },
    { side: 'l', port: [o.x, cyv], out: [o.x - margin, cyv] },
    { side: 'r', port: [o.x + o.w, cyv], out: [o.x + o.w + margin, cyv] },
  ];
  const idx = (p: Pt): [number, number] | undefined => {
    const i = X.indexOf(p[0]);
    const j = Y.indexOf(p[1]);
    return i >= 0 && j >= 0 ? [i, j] : undefined;
  };
  const starts = stubs(a, acx, acy).filter((s) => idx(s.out) && free(s.port, s.out));
  const goals = new Map<number, Stub>();
  for (const s of stubs(b, bcx, bcy)) {
    const ij = idx(s.out);
    if (ij && free(s.out, s.port)) goals.set(key(ij[0], ij[1]), s);
  }
  if (!starts.length || !goals.size) return undefined;

  const BEND = 60;
  // State: node and direction (0 h, 1 v). Binary heap on cost + heuristic.
  type St = { i: number; j: number; d: number; g: number; f: number; prev?: St; start?: Stub };
  const heap: St[] = [];
  const push = (s: St) => {
    heap.push(s);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heap[p].f <= s.f) break;
      heap[k] = heap[p];
      k = p;
    }
    heap[k] = s;
  };
  const pop = (): St | undefined => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length && last) {
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < heap.length && heap[l].f < (m === k ? last.f : heap[m].f)) m = l;
        if (r < heap.length && heap[r].f < (m === k ? last.f : heap[m].f)) m = r;
        if (m === k) break;
        heap[k] = heap[m];
        k = m;
      }
      heap[k] = last;
    }
    return top;
  };
  const h = (i: number, j: number) => Math.abs(X[i] - bcx) + Math.abs(Y[j] - bcy);
  const best = new Map<number, number>();
  for (const s of starts) {
    const [i, j] = idx(s.out)!;
    const d = s.side === 't' || s.side === 'b' ? 1 : 0;
    push({ i, j, d, g: margin, f: margin + h(i, j), start: s });
  }
  let found: St | undefined;
  let steps = 0;
  while (heap.length && steps++ < 200000) {
    const cur = pop()!;
    const k = key(cur.i, cur.j) * 2 + cur.d;
    if ((best.get(k) ?? Infinity) <= cur.g) continue;
    best.set(k, cur.g);
    const goal = goals.get(key(cur.i, cur.j));
    if (goal) {
      const gd = goal.side === 't' || goal.side === 'b' ? 1 : 0;
      found = { ...cur, g: cur.g + (gd === cur.d ? 0 : BEND) };
      break;
    }
    for (const [di, dj, d] of [[1, 0, 0], [-1, 0, 0], [0, 1, 1], [0, -1, 1]] as const) {
      const ni = cur.i + di;
      const nj = cur.j + dj;
      if (ni < 0 || nj < 0 || ni >= X.length || nj >= Y.length) continue;
      const p: Pt = [X[cur.i], Y[cur.j]];
      const q: Pt = [X[ni], Y[nj]];
      if (insideEnd(q) && !goals.has(key(ni, nj))) continue;
      if (!free(p, q)) continue;
      const g = cur.g + Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) + (d === cur.d ? 0 : BEND) + along(p, q);
      push({ i: ni, j: nj, d, g, f: g + h(ni, nj), prev: cur, start: cur.start });
    }
  }
  if (!found) return undefined;
  // Collect the corner points.
  const path: Pt[] = [];
  for (let s: St | undefined = found; s; s = s.prev) path.unshift([X[s.i], Y[s.j]]);
  const start = found.start!;
  const goal = goals.get(key(found.i, found.j))!;
  const full: Pt[] = [start.port, ...path, goal.port];
  const corners: Pt[] = [];
  for (let k = 1; k + 1 < full.length; k++) {
    const [p, c, n] = [full[k - 1], full[k], full[k + 1]];
    const straight = (p[0] === c[0] && c[0] === n[0]) || (p[1] === c[1] && c[1] === n[1]);
    if (!straight) corners.push(c);
  }
  return { fromSide: start.side, toSide: goal.side, points: corners };
}
