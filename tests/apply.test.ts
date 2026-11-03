import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { readView } from '../src/diagram.js';
import { DrawioDoc } from '../src/model/doc.js';
import { addRawCell, dgm, drawioSave, mxCellOf, read, tmpDir, SMALL } from './helpers.js';

async function setup(yaml = SMALL) {
  const dir = tmpDir();
  const r = await dgm(dir, ['create', 'a.drawio'], yaml);
  expect(r.code).toBe(0);
  return dir;
}
const view = (dir: string) => readView(DrawioDoc.parse(read(dir, 'a.drawio')));

/** The XML of each cell, by id. */
function cellXml(xml: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const x of xml.matchAll(/<(object|mxCell)\b[^>]*\bid="([^"]+)"[\s\S]*?<\/\1>|<mxCell\b[^>]*\bid="([^"]+)"[^>]*\/>/g)) m.set(x[2] ?? x[3], x[0]);
  return m;
}

describe('dgm apply', () => {
  it('set changes only the named cell', async () => {
    const dir = await setup();
    const before = cellXml(read(dir, 'a.drawio'));
    const r = await dgm(dir, ['apply', 'a.drawio'], 'set: {svc: {title: Order API}}');
    expect(r.code).toBe(0);
    expect(r.out).toContain('~1 node: svc');
    const after = cellXml(read(dir, 'a.drawio'));
    for (const [id, x] of before) {
      if (id === 'svc') expect(after.get(id)).toContain('label="Order API"');
      else expect(after.get(id), id).toBe(x);
    }
  });

  it('an invalid operation changes nothing and exits 2', async () => {
    const dir = await setup();
    const before = read(dir, 'a.drawio');
    const r = await dgm(dir, ['apply', 'a.drawio'], 'add: {x: X}\nset: {nope: {title: Y}}');
    expect(r.code).toBe(2);
    expect(r.err).toContain('set.nope: unknown node "nope"');
    expect(read(dir, 'a.drawio')).toBe(before);
  });

  it('add a card to a zone; the zone grows', async () => {
    const dir = await setup();
    const z0 = view(dir).byId.get('core')!.geo;
    const r = await dgm(dir, ['apply', 'a.drawio'], 'add: {cache: {title: Redis, icon: database, in: core}, c2: {title: Another, in: core}}');
    expect(r.code).toBe(0);
    const v = view(dir);
    const cache = v.byId.get('cache')!;
    expect(cache.parent).toBe('core');
    const z = v.byId.get('core')!.geo;
    expect(z.w >= z0.w && z.h >= z0.h).toBe(true);
    for (const id of ['cache', 'c2']) {
      const g = v.byId.get(id)!.geo;
      expect(g.x + g.w <= z.w && g.y + g.h <= z.h).toBe(true);
    }
    expect(r.out).toContain('+2 nodes: cache, c2');
  });

  it('rename a cell that a person drew, and style it', async () => {
    const dir = await setup();
    drawioSave(join(dir, 'a.drawio'), (root, doc) => {
      addRawCell(root, doc, 'a1B2c3-4', '<b>Stripe</b>');
      const r = root.getElementsByTagName('root')[0];
      const e = doc.createElement('mxCell');
      e.setAttribute('id', 'hand-edge');
      e.setAttribute('edge', '1');
      e.setAttribute('parent', '1');
      e.setAttribute('source', 'svc');
      e.setAttribute('target', 'a1B2c3-4');
      e.setAttribute('style', 'edgeStyle=orthogonalEdgeStyle;');
      r.appendChild(e);
    });
    const r = await dgm(dir, ['apply', 'a.drawio'], 'set: {"a1B2c3-4": {id: stripe, kind: card, tone: violet}}');
    expect(r.code).toBe(0);
    const xml = read(dir, 'a.drawio');
    const v = view(dir);
    expect(v.byId.get('stripe')).toMatchObject({ kind: 'card', tone: 'violet', title: 'Stripe' });
    expect(v.edges.find((e) => e.id === 'hand-edge')!.ref).toBe('svc -> stripe');
    expect(xml).not.toContain('a1B2c3-4');
    expect(xml).not.toContain('#dae8fc');
    expect(mxCellOf(DrawioDoc.parse(xml).root as never, 'stripe').getAttribute('style')).toContain('strokeColor=light-dark(#7E22CE,#D8B4FE)');
  });

  it('remove a node removes its edges', async () => {
    const dir = await setup();
    const r = await dgm(dir, ['apply', 'a.drawio'], 'connect: [db -> api]\nremove: [db]');
    expect(r.code).toBe(0);
    const v = view(dir);
    expect(v.byId.has('db')).toBe(false);
    expect(v.edges.map((e) => e.ref)).toEqual(['api -> svc']);
    expect(read(dir, 'a.drawio')).not.toContain('db.icon');
  });

  it('remove an edge by reference, and a zone with its children', async () => {
    const dir = await setup();
    const r = await dgm(dir, ['apply', 'a.drawio'], 'remove: ["api -> svc", core]');
    expect(r.code).toBe(0);
    const v = view(dir);
    expect(v.nodes.map((n) => n.id)).toEqual(['api', 'db']);
    expect(v.edges).toEqual([]);
  });

  it('move a card to another zone', async () => {
    const dir = await setup('nodes:\n  a: {kind: zone, nodes: {worker: Worker}}\n  batch: {kind: zone, title: Batch, nodes: {x: X}}\n');
    const r = await dgm(dir, ['apply', 'a.drawio'], 'move: {worker: {in: batch}}');
    expect(r.code).toBe(0);
    expect(view(dir).byId.get('worker')!.parent).toBe('batch');
    expect(r.out).toContain('moved 1 node: worker');
    expect((await dgm(dir, ['apply', 'a.drawio'], 'move: {batch: {in: batch}}')).code).toBe(2);
  });

  it('summary lines', async () => {
    const dir = await setup('nodes: {a: A, b: B, c: C, d: D, e: E}\nedges: [a -> b]\n');
    const r = await dgm(dir, ['apply', 'a.drawio'], 'add: {x: X, y: Y}\nconnect: [x -> y, a -> x, b -> y]\nremove: ["a -> b"]');
    expect(r.code).toBe(0);
    expect(r.out).toContain('+2 nodes');
    expect(r.out).toContain('+3 edges');
    expect(r.out).toContain('-1 edge');
    expect(r.out).toContain('5 nodes kept in place');
  });

  it('set fields: sub, icon, edge label and badge, null removes', async () => {
    const dir = await setup();
    const r = await dgm(dir, ['apply', 'a.drawio'], 'set:\n  svc: {sub: null, icon: cpu}\n  "api -> svc": {label: gRPC, badge: 2, kind: new}\n  pay: {sub: Charges cards}');
    expect(r.code).toBe(0);
    const s = parse((await dgm(dir, ['show', 'a.drawio'])).out);
    expect(s.nodes.core.nodes.svc).toEqual({ title: 'Order Service', icon: 'cpu' });
    expect(s.nodes.core.nodes.pay.sub).toBe('Charges cards');
    expect(s.edges[0]).toEqual({ from: 'api', to: 'svc', label: 'gRPC', kind: 'new', badge: '2' });
    expect(read(dir, 'a.drawio')).not.toContain('svc.sub');
  });

  it('rejects style fields on a raw cell without a kind', async () => {
    const dir = await setup();
    drawioSave(join(dir, 'a.drawio'), (root, doc) => addRawCell(root, doc, 'raw1', 'R'));
    const r = await dgm(dir, ['apply', 'a.drawio'], 'set: {raw1: {tone: sky}}');
    expect(r.code).toBe(2);
    expect(r.err).toContain('Set kind first');
  });
});

describe('placement of new nodes', () => {
  it('a new top-level node with near goes next to that node and overlaps nothing', async () => {
    const dir = await setup('direction: right\nnodes: {api: API, svc: Service, db: DB}\nedges: [api -> svc, svc -> db]\n');
    const r = await dgm(dir, ['apply', 'a.drawio'], 'add: {queue: {title: Queue, near: svc}}');
    expect(r.code).toBe(0);
    const v = view(dir);
    const q = v.byId.get('queue')!.geo;
    const s = v.byId.get('svc')!.geo;
    expect(q.x).toBeGreaterThanOrEqual(s.x + s.w);
    for (const n of v.nodes) {
      if (n.id === 'queue') continue;
      const g = n.geo;
      expect(q.x < g.x + g.w && g.x < q.x + q.w && q.y < g.y + g.h && g.y < q.y + q.h, `overlaps ${n.id}`).toBe(false);
    }
  });

  it('a new card goes to the end of the card row that has room', async () => {
    const dir = await setup('nodes:\n  z:\n    kind: zone\n    nodes: {c1: A, c2: B, ch: {kind: chip, title: Chip}, n: {kind: note, title: Note.}}\n');
    await dgm(dir, ['apply', 'a.drawio'], 'add: {c3: {title: C, in: z}, ch2: {kind: chip, title: Chip 2, in: z}}');
    const v = view(dir);
    const [c2, c3, ch, ch2] = ['c2', 'c3', 'ch', 'ch2'].map((id) => v.byId.get(id)!.geo);
    expect(c3.y).toBe(c2.y);
    expect(c3.x).toBeGreaterThan(c2.x + c2.w);
    expect(ch2.y).toBe(ch.y);
  });

  it('a new top-level node without near goes below the content', async () => {
    const dir = await setup();
    await dgm(dir, ['apply', 'a.drawio'], 'add: {x: X}');
    const v = view(dir);
    const bottom = Math.max(...v.nodes.filter((n) => n.parent === 'page' && n.id !== 'x').map((n) => n.geo.y + n.geo.h));
    expect(v.byId.get('x')!.geo.y).toBeGreaterThan(bottom);
  });

  it('a node that a person moved keeps its position', async () => {
    const dir = await setup();
    drawioSave(join(dir, 'a.drawio'), (root) => {
      const g = mxCellOf(root, 'db').getElementsByTagName('mxGeometry')[0];
      g.setAttribute('x', '1234');
      g.setAttribute('y', '567');
    });
    await dgm(dir, ['apply', 'a.drawio'], 'add: {x: X}');
    expect(view(dir).byId.get('db')!.geo).toMatchObject({ x: 1234, y: 567 });
  });

  it('reports an overlap when a grown zone hits a sibling', async () => {
    const dir = await setup('nodes:\n  z: {kind: zone, title: Z, nodes: {a: A}}\n  w: W\n');
    const zg = view(dir).byId.get('z')!.geo;
    const r = await dgm(dir, ['apply', 'a.drawio'], `add: {big: {title: Big, in: z, at: [${Math.round(zg.w + 60)}, 40]}}`);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/warning: zone z grew and now overlaps w\. Run dgm layout/);
  });
});
