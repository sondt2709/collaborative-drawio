/**
 * From edge intent (ports and via items) to exact points. All coordinates are
 * page coordinates.
 */
import { borderPoint, contains, crossedBoxes, type Pt } from './geom.js';
import { alongLength, gridPath } from './grid.js';

export type Side = 't' | 'r' | 'b' | 'l';
export const SIDES: Side[] = ['t', 'r', 'b', 'l'];

export interface Port {
  side: Side;
  /** Position on the side: 0 = top or left, 1 = bottom or right. Undefined: dgm spreads the edges on the side. */
  pos?: number;
}

export type ViaItem =
  | { kind: 'elbow' }
  | { kind: 'x' | 'y'; value: number }
  | { kind: 'above' | 'below' | 'left' | 'right'; id: string }
  | { kind: 'point'; x: number; y: number };

export type RouteStyle = 'straight' | 'orthogonal' | 'curved';
export const ROUTES: RouteStyle[] = ['straight', 'orthogonal', 'curved'];

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface EdgeIntent {
  id: string;
  from: string;
  to: string;
  fromPort?: Port;
  toPort?: Port;
  via: ViaItem[];
}

export interface Routed {
  /** draw.io exitX/exitY (fractions of the source box), when the source has a port. */
  exit?: [number, number];
  entry?: [number, number];
  points: Array<[number, number]>;
}

// ---- text forms -----------------------------------------------------------

export function parsePort(s: string): Port | undefined {
  const m = /^([trbl])(?:@(\d*\.?\d+))?$/.exec(s.trim());
  if (!m) return undefined;
  const pos = m[2] === undefined ? undefined : Number(m[2]);
  if (pos !== undefined && (pos < 0 || pos > 1)) return undefined;
  return { side: m[1] as Side, pos };
}

export function formatPort(p: Port | undefined): string | undefined {
  if (!p) return undefined;
  return p.pos === undefined ? p.side : `${p.side}@${round2(p.pos)}`;
}

/** A draw.io exit or entry fraction as a port, when it is on a side. */
export function portFromFraction([x, y]: [number, number]): Port | undefined {
  if (x === 0) return { side: 'l', pos: round2(y) };
  if (x === 1) return { side: 'r', pos: round2(y) };
  if (y === 0) return { side: 't', pos: round2(x) };
  if (y === 1) return { side: 'b', pos: round2(x) };
  return undefined;
}

/** Split "id:port" into the id and the port text. */
export function splitEndpoint(s: string): { id: string; port?: string } {
  const i = s.lastIndexOf(':');
  if (i <= 0) return { id: s.trim() };
  return { id: s.slice(0, i).trim(), port: s.slice(i + 1).trim() };
}

const VIA_RE = /^(?:(elbow)|([xy])\s*=\s*(-?\d+(?:\.\d+)?)|(above|below|left|right)\s+(\S+)|\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\])$/;

/** Parse one via item in text form. */
export function parseViaItem(s: string): ViaItem | undefined {
  const m = VIA_RE.exec(s.trim());
  if (!m) return undefined;
  if (m[1]) return { kind: 'elbow' };
  if (m[2]) return { kind: m[2] as 'x' | 'y', value: Number(m[3]) };
  if (m[4]) return { kind: m[4] as 'above', id: m[5] };
  return { kind: 'point', x: Number(m[6]), y: Number(m[7]) };
}

/** Split a via text on commas or "|" that are not inside brackets. */
export function splitViaText(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const c of s) {
    if (c === '[') depth++;
    if (c === ']') depth--;
    if ((c === ',' || c === '|') && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

export function formatViaItem(v: ViaItem): string {
  switch (v.kind) {
    case 'elbow':
      return 'elbow';
    case 'x':
    case 'y':
      return `${v.kind}=${round2(v.value)}`;
    case 'point':
      return `[${round2(v.x)},${round2(v.y)}]`;
    default:
      return `${v.kind} ${v.id}`;
  }
}

export function formatVia(items: ViaItem[]): string | undefined {
  return items.length ? items.map(formatViaItem).join('|') : undefined;
}

export function parseViaText(s: string | undefined): ViaItem[] {
  if (!s) return [];
  const out: ViaItem[] = [];
  for (const part of splitViaText(s)) {
    const v = parseViaItem(part);
    if (v) out.push(v);
  }
  return out;
}

// ---- geometry ---------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Port fractions need more precision: 0.01 of a 210 px card is 2 px. */
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

const cx = (b: Box) => b.x + b.w / 2;
const cy = (b: Box) => b.y + b.h / 2;

function portPoint(b: Box, side: Side, pos: number): [number, number] {
  switch (side) {
    case 't':
      return [b.x + pos * b.w, b.y];
    case 'b':
      return [b.x + pos * b.w, b.y + b.h];
    case 'l':
      return [b.x, b.y + pos * b.h];
    case 'r':
      return [b.x + b.w, b.y + pos * b.h];
  }
}

function fraction(side: Side, pos: number): [number, number] {
  switch (side) {
    case 't':
      return [round4(pos), 0];
    case 'b':
      return [round4(pos), 1];
    case 'l':
      return [0, round4(pos)];
    case 'r':
      return [1, round4(pos)];
  }
}

/** A lane resolved to a coordinate: a horizontal line (y) or a vertical line (x), or a fixed point. */
type Resolved = { dir: 'h'; v: number } | { dir: 'v'; v: number } | { dir: 'p'; x: number; y: number } | { dir: 'elbow' };

function resolve(v: ViaItem, boxes: Map<string, Box>, margin: number): Resolved | undefined {
  switch (v.kind) {
    case 'elbow':
      return { dir: 'elbow' };
    case 'x':
      return { dir: 'v', v: v.value };
    case 'y':
      return { dir: 'h', v: v.value };
    case 'point':
      return { dir: 'p', x: v.x, y: v.y };
    default: {
      const b = boxes.get(v.id);
      if (!b) return undefined;
      if (v.kind === 'above') return { dir: 'h', v: b.y - margin };
      if (v.kind === 'below') return { dir: 'h', v: b.y + b.h + margin };
      if (v.kind === 'left') return { dir: 'v', v: b.x - margin };
      return { dir: 'v', v: b.x + b.w + margin };
    }
  }
}

/** The side of box `b` that faces a lane or point. */
function sideFacing(b: Box, r: Resolved, other: Box): Side {
  if (r.dir === 'h') {
    if (r.v < b.y) return 't';
    if (r.v > b.y + b.h) return 'b';
    return cx(other) >= cx(b) ? 'r' : 'l';
  }
  if (r.dir === 'v') {
    if (r.v < b.x) return 'l';
    if (r.v > b.x + b.w) return 'r';
    return cy(other) >= cy(b) ? 'b' : 't';
  }
  if (r.dir === 'p') {
    if (r.y < b.y) return 't';
    if (r.y > b.y + b.h) return 'b';
    return r.x >= cx(b) ? 'r' : 'l';
  }
  return 'r';
}

/**
 * Ports for an exactly horizontal or vertical line between two boxes that
 * overlap on the other axis by at least 12 px. Undefined when they do not.
 */
function aligned(a: Box, b: Box): Pick<Sided, 'fromSide' | 'toSide' | 'fromPos' | 'toPos'> | undefined {
  const MIN = 12;
  const yTop = Math.max(a.y, b.y);
  const yBot = Math.min(a.y + a.h, b.y + b.h);
  const xL = Math.max(a.x, b.x);
  const xR = Math.min(a.x + a.w, b.x + b.w);
  if (yBot - yTop >= MIN && (a.x + a.w <= b.x || b.x + b.w <= a.x)) {
    const y = (yTop + yBot) / 2;
    const right = b.x >= a.x + a.w;
    return { fromSide: right ? 'r' : 'l', toSide: right ? 'l' : 'r', fromPos: round4((y - a.y) / a.h), toPos: round4((y - b.y) / b.h) };
  }
  if (xR - xL >= MIN && (a.y + a.h <= b.y || b.y + b.h <= a.y)) {
    const x = (xL + xR) / 2;
    const down = b.y >= a.y + a.h;
    return { fromSide: down ? 'b' : 't', toSide: down ? 't' : 'b', fromPos: round4((x - a.x) / a.w), toPos: round4((x - b.x) / b.w) };
  }
  return undefined;
}

function elbowSides(a: Box, b: Box): [Side, Side] {
  const dx = cx(b) - cx(a);
  const dy = cy(b) - cy(a);
  if (Math.abs(dx) >= Math.abs(dy)) return [dx >= 0 ? 'r' : 'l', dy >= 0 ? 't' : 'b'];
  return [dy >= 0 ? 'b' : 't', dx >= 0 ? 'l' : 'r'];
}

/** The start point, the end point and the waypoints of a sided edge. */
function pointsFor(a: Box, b: Box, s: Pick<Sided, 'fromSide' | 'toSide' | 'fromPos' | 'toPos' | 'lanes'>): { p0: Pt; p1: Pt; points: Pt[] } {
  let p0: Pt = s.fromSide ? portPoint(a, s.fromSide, s.fromPos ?? 0.5) : [cx(a), cy(a)];
  let p1: Pt = s.toSide ? portPoint(b, s.toSide, s.toPos ?? 0.5) : [cx(b), cy(b)];
  let points: Pt[] = [];
  let cur: Pt = p0;
  let last: Resolved | undefined;
  for (const l of s.lanes) {
    if (l.dir === 'elbow') {
      const vertical = s.fromSide === 't' || s.fromSide === 'b';
      cur = vertical ? [cur[0], p1[1]] : [p1[0], cur[1]];
      points.push(cur);
      last = undefined;
      continue;
    }
    if (l.dir === 'p') cur = [l.x, l.y];
    else if (l.dir === 'h') cur = [cur[0], l.v];
    else cur = [l.v, cur[1]];
    points.push(cur);
    last = l;
  }
  if (last?.dir === 'h') points.push([p1[0], last.v]);
  else if (last?.dir === 'v') points.push([last.v, p1[1]]);
  // Remove repeated points and points on the ports.
  const same = (p: Pt, q: Pt) => Math.abs(p[0] - q[0]) < 0.01 && Math.abs(p[1] - q[1]) < 0.01;
  points = points
    .map(([x, y]) => [round2(x), round2(y)] as Pt)
    .filter((p, i, arr) => !(i > 0 && same(p, arr[i - 1])))
    .filter((p) => !same(p, p0) && !same(p, p1));
  // Without fixed ports, draw.io starts the line at the border, toward the first point.
  if (!s.fromSide) p0 = borderPoint(a, points[0] ?? p1);
  if (!s.toSide) p1 = borderPoint(b, points[points.length - 1] ?? p0);
  return { p0, p1, points };
}

type Auto = Pick<Sided, 'fromSide' | 'toSide' | 'fromPos' | 'toPos' | 'lanes'>;

/**
 * The default route of an edge without ports and via: the straight line,
 * exactly horizontal or vertical when the boxes overlap. When that line crosses
 * a box, the detour with the fewest crossings, then the fewest bends, then the
 * shortest length: an elbow, a Z through the gap, or a U around the boxes.
 */
function autoRoute(a: Box, b: Box, e: EdgeIntent, obstacles: Array<{ id: string; box: Box }>, margin: number, zones: Box[]): Auto {
  const obs = obstacles.filter((o) => o.id !== e.from && o.id !== e.to && !contains(o.box, a) && !contains(o.box, b));
  const lineOf = (c: Auto): Pt[] => {
    const { p0, p1, points } = pointsFor(a, b, c);
    return [p0, ...points, p1];
  };
  const straight: Auto = { lanes: [], ...(aligned(a, b) ?? {}) };
  // A line must keep a small distance from other boxes (negative inset).
  const CLEAR = -8;
  const hits = crossedBoxes(lineOf(straight), obs, CLEAR);
  if (!hits.length) return straight;
  const ac: Pt = [cx(a), cy(a)];
  const bc: Pt = [cx(b), cy(b)];
  const right = bc[0] >= ac[0];
  const down = bc[1] >= ac[1];
  const cands: Auto[] = [
    { fromSide: right ? 'r' : 'l', toSide: down ? 't' : 'b', lanes: [{ dir: 'elbow' }] },
    { fromSide: down ? 'b' : 't', toSide: right ? 'l' : 'r', lanes: [{ dir: 'elbow' }] },
  ];
  if (a.x + a.w <= b.x || b.x + b.w <= a.x) {
    const mx = right ? (a.x + a.w + b.x) / 2 : (b.x + b.w + a.x) / 2;
    cands.push({ fromSide: right ? 'r' : 'l', toSide: right ? 'l' : 'r', lanes: [{ dir: 'v', v: round2(mx) }] });
  }
  if (a.y + a.h <= b.y || b.y + b.h <= a.y) {
    const my = down ? (a.y + a.h + b.y) / 2 : (b.y + b.h + a.y) / 2;
    cands.push({ fromSide: down ? 'b' : 't', toSide: down ? 't' : 'b', lanes: [{ dir: 'h', v: round2(my) }] });
  }
  const blockers = obs.filter((o) => hits.includes(o.id)).map((o) => o.box);
  const all = [a, b, ...blockers];
  const top = Math.min(...all.map((x) => x.y)) - margin;
  const bottom = Math.max(...all.map((x) => x.y + x.h)) + margin;
  const left = Math.min(...all.map((x) => x.x)) - margin;
  const rightX = Math.max(...all.map((x) => x.x + x.w)) + margin;
  cands.push(
    { fromSide: 't', toSide: 't', lanes: [{ dir: 'h', v: top }] },
    { fromSide: 'b', toSide: 'b', lanes: [{ dir: 'h', v: bottom }] },
    { fromSide: 'l', toSide: 'l', lanes: [{ dir: 'v', v: left }] },
    { fromSide: 'r', toSide: 'r', lanes: [{ dir: 'v', v: rightX }] },
  );
  let best = straight;
  let bestScore = hits.length * 1000;
  for (const c of cands) {
    const line = lineOf(c);
    let len = 0;
    for (let i = 0; i + 1 < line.length; i++) len += Math.hypot(line[i + 1][0] - line[i][0], line[i + 1][1] - line[i][1]);
    const score = crossedBoxes(line, obs, CLEAR).length * 1000 + (line.length - 2) * 10 + len / 1000 + Math.min(300, alongLength(line, zones, margin / 2));
    if (score < bestScore) {
      best = c;
      bestScore = score;
    }
  }
  if (bestScore >= 100) {
    // Every simple shape crosses a box or runs along a border: search an orthogonal path.
    const g = gridPath(a, b, obs.map((o) => o.box), Math.max(10, margin / 2), zones);
    if (g) {
      const cand: Auto = { fromSide: g.fromSide, toSide: g.toSide, fromPos: 0.5, toPos: 0.5, lanes: g.points.map(([x, y]) => ({ dir: 'p' as const, x, y })) };
      const line = lineOf(cand);
      const score = crossedBoxes(line, obs, CLEAR).length * 1000 + (line.length - 2) * 10 + Math.min(300, alongLength(line, zones, margin / 2));
      if (score < bestScore) return cand;
    }
  }
  return best;
}

interface Sided {
  e: EdgeIntent;
  lanes: Resolved[];
  fromSide?: Side;
  toSide?: Side;
  fromPos?: number;
  toPos?: number;
}

/**
 * Compute the points and port fractions of each edge. Edges with an unknown
 * endpoint are left out.
 */
export function routeEdges(
  edges: EdgeIntent[],
  boxes: Map<string, Box>,
  margin: number,
  obstacles: Array<{ id: string; box: Box }> = [],
  zones: Box[] = [],
): Map<string, Routed> {
  const sided: Sided[] = [];
  for (const e of edges) {
    const a = boxes.get(e.from);
    const b = boxes.get(e.to);
    if (!a || !b) continue;
    const lanes = e.via.map((v) => resolve(v, boxes, margin)).filter((r): r is Resolved => r !== undefined);
    const s: Sided = { e, lanes, fromSide: e.fromPort?.side, toSide: e.toPort?.side, fromPos: e.fromPort?.pos, toPos: e.toPort?.pos };
    const real = lanes.filter((l) => l.dir !== 'elbow');
    if (!lanes.length && !e.fromPort && !e.toPort) {
      // Straight by default: exactly horizontal or vertical when the boxes
      // overlap; a detour only when the straight line crosses a box.
      Object.assign(s, autoRoute(a, b, e, obstacles, margin, zones));
    } else if (lanes.some((l) => l.dir === 'elbow') && !real.length) {
      const [fs, ts] = elbowSides(a, b);
      s.fromSide ??= fs;
      s.toSide ??= ts;
    } else if (real.length) {
      s.fromSide ??= sideFacing(a, real[0], b);
      s.toSide ??= sideFacing(b, real[real.length - 1], a);
    }
    sided.push(s);
  }

  // Spread edges without a position on each side of each box, ordered by the other end.
  const groups = new Map<string, Array<{ s: Sided; end: 'from' | 'to'; key: number }>>();
  for (const s of sided) {
    for (const end of ['from', 'to'] as const) {
      const side = end === 'from' ? s.fromSide : s.toSide;
      const pos = end === 'from' ? s.fromPos : s.toPos;
      if (!side || pos !== undefined) continue;
      const node = end === 'from' ? s.e.from : s.e.to;
      const other = boxes.get(end === 'from' ? s.e.to : s.e.from)!;
      // The first or last lane point, else the center of the other box, gives the order.
      const lane = end === 'from' ? s.lanes.find((l) => l.dir !== 'elbow') : [...s.lanes].reverse().find((l) => l.dir !== 'elbow');
      let key = side === 't' || side === 'b' ? cx(other) : cy(other);
      if (lane?.dir === 'p') key = side === 't' || side === 'b' ? lane.x : lane.y;
      if (lane?.dir === 'v' && (side === 't' || side === 'b')) key = lane.v;
      if (lane?.dir === 'h' && (side === 'l' || side === 'r')) key = lane.v;
      const k = `${node}\u0000${side}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push({ s, end, key });
    }
  }
  for (const list of groups.values()) {
    list.sort((p, q) => p.key - q.key || p.s.e.id.localeCompare(q.s.e.id));
    list.forEach((it, i) => {
      const pos = round4((i + 1) / (list.length + 1));
      if (it.end === 'from') it.s.fromPos = pos;
      else it.s.toPos = pos;
    });
  }

  const out = new Map<string, Routed>();
  for (const s of sided) {
    const a = boxes.get(s.e.from)!;
    const b = boxes.get(s.e.to)!;
    const r: Routed = { points: pointsFor(a, b, s).points };
    if (s.fromSide) r.exit = fraction(s.fromSide, s.fromPos ?? 0.5);
    if (s.toSide) r.entry = fraction(s.toSide, s.toPos ?? 0.5);
    out.set(s.e.id, r);
  }
  return out;
}
