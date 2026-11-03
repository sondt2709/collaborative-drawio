import type { Element } from '@xmldom/xmldom';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { edgeLines } from '../src/check.js';
import { absBoxes, obstacles, readView } from '../src/diagram.js';
import { lineWidth } from '../src/layout/text.js';
import { DrawioDoc } from '../src/model/doc.js';
import { fromHtmlLabel } from '../src/model/text.js';
import type { Box } from '../src/route/route.js';
import { labelSize, placeLabel } from '../src/route/label.js';
import { readView as view } from '../src/diagram.js';
import { loadTheme } from '../src/theme/theme.js';
import { dgm, drawioSave, read, tmpDir, write } from './helpers.js';

const theme = loadTheme('pro', join(tmpDir(), 'x.drawio'), { DGM_CONFIG_DIR: '/nonexistent' });

/** Synthetic diagram with short gaps and long labels. */
export const LABELS = `title: Shop checkout
nodes:
  buyers: {title: Buyers, sub: Mobile app, icon: smartphone}
  shop:
    kind: zone
    title: Shop cluster
    rows:
      - [lb]
      - [cart, checkout, pay]
      - [stock, kafka, mailer]
    nodes:
      lb: {title: Load balancer, sub: Health checks, icon: network}
      cart: {title: Cart service, sub: Keeps baskets, icon: shopping-cart}
      checkout: {title: Checkout, sub: Go service, icon: server}
      pay: {title: Payment gateway, sub: Card and wallet payments, icon: credit-card}
      stock: {title: Stock sync, sub: Nightly import, icon: package}
      kafka: {kind: cylinder, title: Kafka, sub: topic shop.orders, icon: database}
      mailer: {title: Mail worker, sub: Receipts and reminders, icon: mail}
edges:
  - "buyers -> lb": TLS 1.3
  - lb -> cart
  - "lb -> checkout": /checkout
  - "lb -> pay": /pay
  - "cart -> checkout": basket snapshot
  - "checkout -> pay": charge
  - "checkout -> kafka": order placed
  - "stock -> kafka": stock levels
  - "mailer -> kafka": subscribe
`;

type Pt = [number, number];

/** The point at fraction t (0..1) of the length of a polyline. */
function along(line: Pt[], t: number): Pt {
  const lens = line.slice(1).map((p, i) => Math.hypot(p[0] - line[i][0], p[1] - line[i][1]));
  let rest = t * lens.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lens.length; i++) {
    if (rest <= lens[i] || i === lens.length - 1) {
      const f = lens[i] ? Math.min(1, rest / lens[i]) : 0;
      return [line[i][0] + (line[i + 1][0] - line[i][0]) * f, line[i][1] + (line[i + 1][1] - line[i][1]) * f];
    }
    rest -= lens[i];
  }
  return line[0];
}

/**
 * The label box of each labeled edge, as draw.io places it: geometry x from -1
 * to 1 along the path, plus the absolute offset point.
 */
export function labelBoxes(doc: DrawioDoc): Array<{ ref: string; text: string; box: Box }> {
  const view = readView(doc);
  const out: Array<{ ref: string; text: string; box: Box }> = [];
  for (const l of edgeLines(doc)) {
    const e = view.edges.find((x) => x.ref === l.ref)!;
    const text = fromHtmlLabel(doc.label(e.cell));
    if (!text) continue;
    const g = e.cell.cell.getElementsByTagName('mxGeometry')[0];
    const gx = Number(g?.getAttribute('x') ?? 0) || 0;
    const pts = g ? Array.from(g.getElementsByTagName('mxPoint')) : [];
    const off = pts.find((p) => p.getAttribute('as') === 'offset');
    const [cx, cy] = along(l.line, (gx + 1) / 2);
    const ox = Number(off?.getAttribute('x') ?? 0) || 0;
    const oy = Number(off?.getAttribute('y') ?? 0) || 0;
    const w = lineWidth(text, 11) + 4;
    const h = 14;
    out.push({ ref: l.ref, text, box: { x: cx + ox - w / 2, y: cy + oy - h / 2, w, h } });
  }
  return out;
}

const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** "<edge ref>: <label> on <id>" for each label box that overlaps a node box. */
export function labelOverlaps(doc: DrawioDoc): string[] {
  const view = readView(doc);
  const obs = obstacles(doc, view, absBoxes(doc), theme);
  const out: string[] = [];
  for (const l of labelBoxes(doc)) for (const o of obs) if (overlaps(l.box, o.box)) out.push(`${l.ref}: ${l.text} on ${o.id}`);
  return out;
}

describe('edge labels', () => {
  it('no label covers a box', async () => {
    const dir = tmpDir();
    write(dir, 'spec.yaml', LABELS);
    expect((await dgm(dir, ['create', 'a.drawio', '--from', 'spec.yaml'])).code).toBe(0);
    const doc = DrawioDoc.parse(read(dir, 'a.drawio'));
    expect(labelBoxes(doc).length).toBe(8);
    expect(labelOverlaps(doc)).toEqual([]);
  });
});

describe('label placement', () => {
  const size = { w: 40, h: 18 };
  const free = (b: Box, obs: Box[]) => obs.every((o) => !overlaps(b, o));

  it('takes the middle of the longest segment when it is free', () => {
    const p = placeLabel([[0, 0], [0, 40], [300, 40]], size, []);
    expect(p).toMatchObject({ free: true, offset: [0, 0] });
    expect(p.box.x + p.box.w / 2).toBeCloseTo(150);
    expect(p.box.y + p.box.h / 2).toBeCloseTo(40);
  });

  it('moves along the line to the nearest free point', () => {
    const obs = [{ x: 80, y: -20, w: 40, h: 40 }];
    const p = placeLabel([[0, 0], [300, 0]], size, obs);
    expect(p.free).toBe(true);
    expect(free(p.box, obs)).toBe(true);
    expect(Math.abs(p.box.x + p.box.w / 2 - 150)).toBeLessThan(40);
  });

  it('goes beside a short vertical line when the line has no space', () => {
    const obs = [{ x: -3, y: -40, w: 6, h: 40 }, { x: -3, y: 20, w: 6, h: 40 }];
    const p = placeLabel([[0, 0], [0, 20]], size, obs);
    expect(p.free).toBe(true);
    expect(p.offset[1]).toBe(0);
    expect(Math.abs(p.offset[0])).toBe(size.w / 2 + 6);
    expect(free(p.box, obs)).toBe(true);
  });

  it('keeps a label away from labels placed before', () => {
    const first = placeLabel([[0, 0], [300, 0]], size, []);
    const second = placeLabel([[0, 0], [300, 0]], size, [], [first.box]);
    expect(overlaps(first.box, second.box)).toBe(false);
  });

  it('falls back to the middle of the longest segment', () => {
    const p = placeLabel([[0, 0], [100, 0]], size, [{ x: -50, y: -50, w: 200, h: 100 }]);
    expect(p).toMatchObject({ free: false, x: 0, offset: [0, 0] });
  });

  it('writes the same file for the same YAML', async () => {
    const dir = tmpDir();
    write(dir, 'spec.yaml', LABELS);
    await dgm(dir, ['create', 'a.drawio', '--from', 'spec.yaml']);
    await dgm(dir, ['create', 'b.drawio', '--from', 'spec.yaml']);
    expect(read(dir, 'a.drawio')).toBe(read(dir, 'b.drawio'));
    expect(read(dir, 'a.drawio')).toMatch(/<mxPoint (x|y)="[^"]+"( y="[^"]+")? as="offset"|<mxGeometry x="-?0\.\d+" relative="1"/);
  });
});

describe('gaps for labels', () => {
  const geo = async (yaml: string) => {
    const dir = tmpDir();
    write(dir, 's.yaml', yaml);
    expect((await dgm(dir, ['create', 'a.drawio', '--from', 's.yaml'])).code).toBe(0);
    return view(DrawioDoc.parse(read(dir, 'a.drawio'))).byId;
  };
  const LONG = 'basket snapshot with all lines';

  it('widens the column gap for a label', async () => {
    const n = await geo(`nodes:\n  z: {kind: zone, rows: [[a, b]], nodes: {a: A, b: B}}\nedges:\n  - "a -> b": ${LONG}\n`);
    const gap = n.get('b')!.geo.x - (n.get('a')!.geo.x + n.get('a')!.geo.w);
    expect(gap).toBeGreaterThanOrEqual(labelSize(LONG).w + 32);
  });

  it('keeps the theme gap without a label', async () => {
    const n = await geo('nodes:\n  z: {kind: zone, rows: [[a, b]], nodes: {a: A, b: B}}\nedges:\n  - a -> b\n');
    expect(n.get('b')!.geo.x - (n.get('a')!.geo.x + n.get('a')!.geo.w)).toBe(theme.sizes.zone.gap);
  });

  it('widens the row gap for a label', async () => {
    const n = await geo('nodes:\n  z: {kind: zone, rows: [[a], [b]], nodes: {a: A, b: B}}\nedges:\n  - "a -> b": reads\n');
    expect(n.get('b')!.geo.y - (n.get('a')!.geo.y + n.get('a')!.geo.h)).toBeGreaterThanOrEqual(labelSize('reads').h + 32);
  });

  it('widens the layer gap for direction right', async () => {
    const n = await geo(`direction: right\nnodes: {a: A, b: B}\nedges:\n  - "a -> b": ${LONG}\n`);
    expect(n.get('b')!.geo.x - (n.get('a')!.geo.x + n.get('a')!.geo.w)).toBeGreaterThanOrEqual(labelSize(LONG).w + 32);
  });
});

describe('labels that a person dragged', () => {
  it('keeps the label position on apply and reports the move', async () => {
    const dir = tmpDir();
    write(dir, 'spec.yaml', LABELS);
    await dgm(dir, ['create', 'a.drawio', '--from', 'spec.yaml']);
    const file = `${dir}/a.drawio`;
    const edgeOf = (root: Element): Element =>
      Array.from(root.getElementsByTagName('mxCell')).find((c) => c.getAttribute('source') === 'cart' && c.getAttribute('target') === 'checkout')!;
    drawioSave(file, (root, doc) => {
      const g = edgeOf(root).getElementsByTagName('mxGeometry')[0];
      for (const p of Array.from(g.getElementsByTagName('mxPoint'))) if (p.getAttribute('as') === 'offset') g.removeChild(p);
      g.setAttribute('x', '0.5');
      const off = doc.createElement('mxPoint');
      off.setAttribute('y', '-20');
      off.setAttribute('as', 'offset');
      g.appendChild(off);
    });
    const st = await dgm(dir, ['status', 'a.drawio']);
    expect(st.out).toContain('~ edge cart -> checkout label moved in draw.io');
    const r = await dgm(dir, ['apply', 'a.drawio'], 'add:\n  cache: {title: Redis, in: shop}\n');
    expect(r.code).toBe(0);
    const doc = DrawioDoc.parse(read(dir, 'a.drawio'));
    const e = readView(doc).edges.find((x) => x.ref === 'cart -> checkout')!;
    expect(doc.edgeLabelPos(e.cell)).toEqual({ x: 0.5, y: 0, offset: [0, -20] });
    // Other labels are still placed by dgm.
    const other = readView(doc).edges.find((x) => x.ref === 'checkout -> pay')!;
    expect(doc.edgeLabelPos(other.cell).x).not.toBe(0.5);
  });
});

describe('label check hint', () => {
  it('reports a label that overlaps a box', async () => {
    const dir = tmpDir();
    write(dir, 's.yaml', 'nodes:\n  a: {title: A, at: [40, 40]}\n  b: {title: B, at: [270, 40]}\nedges:\n  - "a -> b": reads the price list\n');
    await dgm(dir, ['create', 'a.drawio', '--from', 's.yaml']);
    const r = await dgm(dir, ['check', 'a.drawio']);
    expect(r.out).toContain('hint: label "reads the price list" of edge a -> b overlaps a, b. Shorten the label, or run dgm layout');
    expect(r.code).toBe(0);
  });

  it('is quiet when the labels are free', async () => {
    const dir = tmpDir();
    write(dir, 'spec.yaml', LABELS);
    await dgm(dir, ['create', 'a.drawio', '--from', 'spec.yaml']);
    expect((await dgm(dir, ['check', 'a.drawio'])).out).not.toContain('hint: label');
  });
});
