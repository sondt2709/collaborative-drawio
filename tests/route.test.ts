import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { readView } from '../src/diagram.js';
import { parseDiagram, readYaml } from '../src/dsl/parse.js';
import { DrawioDoc } from '../src/model/doc.js';
import { getStyle } from '../src/model/style.js';
import { routeEdges, type Box } from '../src/route/route.js';
import { segmentHitsBox } from '../src/route/geom.js';
import { loadTheme } from '../src/theme/theme.js';
import { byId, dgm, drawioSave, mxCellOf, read, tmpDir, write } from './helpers.js';

const theme = loadTheme('pro', join(tmpDir(), 'x.drawio'), { DGM_CONFIG_DIR: '/nonexistent' });
const errorsOf = (y: string): string[] => {
  try {
    parseDiagram(readYaml(y), theme);
  } catch (e) {
    return (e as { problems: string[] }).problems;
  }
  return [];
};

const B = (x: number, y: number, w = 100, h = 50): Box => ({ x, y, w, h });

describe('edge syntax', () => {
  it('reads ports, the via clause and route', () => {
    const s = parseDiagram(readYaml('nodes: {api: A, pay: P, core: {kind: zone, nodes: {x: X}}}\nedges:\n  - {"api:t -> pay:t via above core": REST}\n  - {from: "api:r@0.3", to: pay, via: [y=70, [10, 20]], route: orthogonal}\n'), theme);
    expect(s.edges[0]).toMatchObject({ from: 'api', to: 'pay', label: 'REST', fromPort: { side: 't' }, toPort: { side: 't' }, via: [{ kind: 'above', id: 'core' }] });
    expect(s.edges[1]).toMatchObject({ fromPort: { side: 'r', pos: 0.3 }, via: [{ kind: 'y', value: 70 }, { kind: 'point', x: 10, y: 20 }], route: 'orthogonal' });
  });

  it('names the path of an invalid port, via item, unknown via node and route', () => {
    expect(errorsOf('nodes: {api: A, svc: S}\nedges: [api:x -> svc]')[0]).toMatch(/^edges\[0\]: invalid port "x" in "api:x". Use a side t, r, b or l/);
    expect(errorsOf('nodes: {api: A, svc: S}\nedges: [{from: api, to: svc, via: sideways}]')[0]).toMatch(/^edges\[0\]\.via: invalid via item "sideways"/);
    expect(errorsOf('nodes: {api: A, svc: S}\nedges: ["api -> svc via below nope"]')[0]).toBe('edges[0]: unknown node "nope" in via');
    expect(errorsOf('nodes: {api: A, svc: S}\nedges: [{from: api, to: svc, route: zigzag}]')[0]).toMatch(/^edges\[0\]\.route: unknown route "zigzag"/);
  });
});

describe('routing', () => {
  it('a port on a side writes exit and entry', () => {
    const r = routeEdges([{ id: 'e', from: 'a', to: 'b', fromPort: { side: 'r' }, toPort: { side: 'l' }, via: [] }], new Map([['a', B(0, 0)], ['b', B(300, 100)]]), 24);
    expect(r.get('e')).toEqual({ exit: [1, 0.5], entry: [0, 0.5], points: [] });
  });

  it('spreads two edges on one side, ordered by the other end', () => {
    const boxes = new Map([['order', B(100, 0, 300, 50)], ['db', B(0, 300)], ['cache', B(400, 300)]]);
    const r = routeEdges(
      [
        { id: 'e2', from: 'order', to: 'cache', fromPort: { side: 'b' }, via: [] },
        { id: 'e1', from: 'order', to: 'db', fromPort: { side: 'b' }, via: [] },
      ],
      boxes,
      24,
    );
    expect(r.get('e1')!.exit).toEqual([0.3333, 1]);
    expect(r.get('e2')!.exit).toEqual([0.6667, 1]);
  });

  it('via above a box: two points with the same y, above the box by the lane margin', () => {
    const boxes = new Map([['api', B(0, 100)], ['pay', B(400, 100)], ['core', B(200, 60, 400, 200)]]);
    const r = routeEdges([{ id: 'e', from: 'api', to: 'pay', fromPort: { side: 't' }, toPort: { side: 't' }, via: [{ kind: 'above', id: 'core' }] }], boxes, 24);
    expect(r.get('e')!.points).toEqual([
      [50, 36],
      [450, 36],
    ]);
  });

  it('elbow: one point with the x of the source port and the y of the target port', () => {
    const boxes = new Map([['order', B(0, 0)], ['db', B(300, 200)]]);
    const r = routeEdges([{ id: 'e', from: 'order', to: 'db', fromPort: { side: 'b' }, toPort: { side: 'l' }, via: [{ kind: 'elbow' }] }], boxes, 24);
    expect(r.get('e')!.points).toEqual([[50, 225]]);
  });

  it('default: exactly horizontal when the boxes overlap vertically', () => {
    const boxes = new Map([['a', B(0, 100, 100, 50)], ['b', B(300, 110, 100, 80)]]);
    const r = routeEdges([{ id: 'e', from: 'a', to: 'b', via: [] }], boxes, 24).get('e')!;
    const ya = 100 + r.exit![1] * 50;
    const yb = 110 + r.entry![1] * 80;
    expect(Math.abs(ya - yb)).toBeLessThan(0.05);
    expect(r.points).toEqual([]);
  });

  it('default: a detour that crosses no box when the straight line would', () => {
    const boxes = new Map([['a', B(0, 0)], ['mid', B(200, 0)], ['b', B(400, 0)]]);
    const obstacles = [{ id: 'mid', box: boxes.get('mid')! }];
    const r = routeEdges([{ id: 'e', from: 'a', to: 'b', via: [] }], boxes, 24, obstacles).get('e')!;
    expect(r.points.length).toBeGreaterThan(0);
    const line: Array<[number, number]> = [[0 + r.exit![0] * 100, r.exit![1] * 50], ...r.points, [400 + r.entry![0] * 100, r.entry![1] * 50]];
    for (let i = 0; i + 1 < line.length; i++) expect(segmentHitsBox(line[i], line[i + 1], boxes.get('mid')!)).toBe(false);
  });
});

const SHOP = `direction: right
nodes:
  api: API
  core:
    kind: zone
    nodes: {order: Order, pay: Pay, cache: Cache}
  db: {kind: cylinder, title: DB}
edges:
  - api -> order
  - api -> pay
  - order -> cache
  - order -> db
`;

describe('files', () => {
  it('a default edge is straight and rounded', async () => {
    const dir = tmpDir();
    await dgm(dir, ['create', 'a.drawio'], 'nodes: {api: A, svc: B}\nedges: [api -> svc]');
    const st = mxCellOf(DrawioDoc.parse(read(dir, 'a.drawio')).root as never, 'e1').getAttribute('style')!;
    expect(st).not.toContain('edgeStyle');
    expect(st).toContain('rounded=1;arcSize=36');
    await dgm(dir, ['apply', 'a.drawio'], 'set: {"api -> svc": {route: orthogonal}}');
    expect(mxCellOf(DrawioDoc.parse(read(dir, 'a.drawio')).root as never, 'e1').getAttribute('style')).toContain('edgeStyle=orthogonalEdgeStyle');
  });

  it('show prints ports, via and route, and create reads them back', async () => {
    const dir = tmpDir();
    const y = 'nodes: {api: A, pay: P, core: {kind: zone, nodes: {x: X}}}\nedges:\n  - {"api:t -> pay:t via above core": REST}\n  - {from: api, to: pay, via: elbow, route: curved}\n';
    await dgm(dir, ['create', 'a.drawio'], y);
    const shown = (await dgm(dir, ['show', 'a.drawio'])).out;
    expect(parse(shown).edges).toEqual([{ 'api:t -> pay:t via above core': 'REST' }, { from: 'api', to: 'pay', via: 'elbow', route: 'curved' }]);
    await dgm(dir, ['create', 'b.drawio'], shown);
    expect((await dgm(dir, ['show', 'b.drawio'])).out).toBe(shown);
  });

  it('steer an edge with set', async () => {
    const dir = tmpDir();
    await dgm(dir, ['create', 'a.drawio'], SHOP);
    const r = await dgm(dir, ['apply', 'a.drawio'], 'set: {"order -> cache": {from: "order:b", to: "cache:b", via: below core}}');
    expect(r.code).toBe(0);
    const e = readView(DrawioDoc.parse(read(dir, 'a.drawio'))).edges.find((x) => x.ref === 'order -> cache')!;
    expect(e.fromPort).toEqual({ side: 'b' });
    expect(e.toPort).toEqual({ side: 'b' });
    expect(e.via).toEqual([{ kind: 'below', id: 'core' }]);
    const doc = DrawioDoc.parse(read(dir, 'a.drawio'));
    const core = readView(doc).byId.get('core')!.geo;
    for (const [, y] of e.points) expect(y).toBe(core.y + core.h + 24);
  });

  it('points follow a box that a person moved, at the next apply', async () => {
    const dir = tmpDir();
    await dgm(dir, ['create', 'a.drawio'], `${SHOP}  - {from: "api:b", to: "db:b", via: below core}\n`);
    drawioSave(join(dir, 'a.drawio'), (root) => {
      const g = mxCellOf(root, 'core').getElementsByTagName('mxGeometry')[0];
      g.setAttribute('y', String(Number(g.getAttribute('y') ?? 0) + 200));
    });
    await dgm(dir, ['apply', 'a.drawio'], 'add: {x: X}');
    const doc = DrawioDoc.parse(read(dir, 'a.drawio'));
    const v = readView(doc);
    const core = v.byId.get('core')!.geo;
    const e = v.edges.find((x) => x.ref === 'api -> db')!;
    expect(e.points.every(([, y]) => y === core.y + core.h + 24)).toBe(true);
  });

  it('keeps the points that a person dragged, and status reports it', async () => {
    const dir = tmpDir();
    await dgm(dir, ['create', 'a.drawio'], SHOP);
    const id = readView(DrawioDoc.parse(read(dir, 'a.drawio'))).edges.find((x) => x.ref === 'api -> pay')!.id;
    drawioSave(join(dir, 'a.drawio'), (root, d) => {
      const g = mxCellOf(root, id).getElementsByTagName('mxGeometry')[0];
      for (const a of Array.from(g.getElementsByTagName('Array'))) g.removeChild(a);
      const arr = d.createElement('Array');
      arr.setAttribute('as', 'points');
      const p = d.createElement('mxPoint');
      p.setAttribute('x', '777');
      p.setAttribute('y', '555');
      arr.appendChild(p);
      g.appendChild(arr);
    });
    expect((await dgm(dir, ['status', 'a.drawio'])).out).toContain('~ edge api -> pay route changed in draw.io');
    const r = await dgm(dir, ['layout', 'a.drawio']);
    expect(r.out).toContain('kept the route that a person changed: api -> pay');
    const e = readView(DrawioDoc.parse(read(dir, 'a.drawio'))).edges.find((x) => x.ref === 'api -> pay')!;
    expect(e.points).toEqual([[777, 555]]);
    expect((await dgm(dir, ['show', 'a.drawio'])).out).toMatch(/api:r@[\d.]+ -> pay:l@[\d.]+ via \[777,555\]/);
  });
});

describe('layout aligned by edges', () => {
  it('connected cards in a zone: no crossing, and api -> order is exactly horizontal', async () => {
    const dir = tmpDir();
    const r = await dgm(dir, ['create', 'a.drawio'], SHOP);
    expect(r.out).not.toContain('hint:');
    const doc = DrawioDoc.parse(read(dir, 'a.drawio'));
    const e = readView(doc).edges.find((x) => x.ref === 'api -> order')!;
    const st = doc.style(e.cell);
    const api = readView(doc).byId.get('api')!.geo;
    const core = readView(doc).byId.get('core')!.geo;
    const order = readView(doc).byId.get('order')!.geo;
    const y0 = api.y + Number(getStyle(st, 'exitY')) * api.h;
    const y1 = core.y + order.y + Number(getStyle(st, 'entryY')) * order.h;
    expect(Math.abs(y0 - y1)).toBeLessThan(0.05);
  });
});

describe('style rules', () => {
  it('a zone like the page background is transparent; a tinted zone keeps its tint', async () => {
    const dir = tmpDir();
    await dgm(dir, ['create', 'a.drawio'], 'nodes:\n  a: {kind: zone, style: {fill: surface}, nodes: {x: X}}\n  b: {kind: zone, tone: violet, nodes: {y: Y}}\n');
    const root = DrawioDoc.parse(read(dir, 'a.drawio')).root as never;
    expect(mxCellOf(root, 'a').getAttribute('style')).toContain('fillColor=none;');
    expect(mxCellOf(root, 'b').getAttribute('style')).toContain('fillColor=light-dark(#FAF5FF,#2E1065);');
  });

  it('text that a person puts on a zone moves into the zone at the same page position', async () => {
    const dir = tmpDir();
    await dgm(dir, ['create', 'a.drawio'], 'nodes: {core: {kind: zone, nodes: {x: X, y: Y}}}');
    const zone = readView(DrawioDoc.parse(read(dir, 'a.drawio'))).byId.get('core')!.geo;
    drawioSave(join(dir, 'a.drawio'), (root, d) => {
      const r = root.getElementsByTagName('root')[0];
      const c = d.createElement('mxCell');
      c.setAttribute('id', 'txt1');
      c.setAttribute('value', 'Remember');
      c.setAttribute('style', 'text;html=1;');
      c.setAttribute('vertex', '1');
      c.setAttribute('parent', '1');
      const g = d.createElement('mxGeometry');
      g.setAttribute('x', String(zone.x + 30));
      g.setAttribute('y', String(zone.y + zone.h - 30));
      g.setAttribute('width', '60');
      g.setAttribute('height', '20');
      g.setAttribute('as', 'geometry');
      c.appendChild(g);
      r.appendChild(c);
    });
    expect((await dgm(dir, ['check', 'a.drawio'])).out).toContain('hint: text txt1 sits on zone core but is not part of it');
    const r = await dgm(dir, ['apply', 'a.drawio'], 'set: {x: {title: X2}}');
    expect(r.out).toContain('grouped text: txt1 into core');
    const v = readView(DrawioDoc.parse(read(dir, 'a.drawio')));
    expect(v.byId.get('txt1')).toMatchObject({ parent: 'core', geo: { x: 30, y: zone.h - 30 } });
    expect(byId(DrawioDoc.parse(read(dir, 'a.drawio')).root as never, 'txt1')).toBeDefined();
  });
});

describe('hints', () => {
  it('a line through a card, and the exit code stays 0', async () => {
    const dir = tmpDir();
    await dgm(dir, ['create', 'a.drawio'], 'direction: right\nnodes: {order: {title: O, at: [0, 0]}, pay: {title: P, at: [300, 0]}, cache: {title: C, at: [600, 0]}}');
    const r = await dgm(dir, ['apply', 'a.drawio'], 'connect: ["order:r -> cache:l"]');
    expect(r.code).toBe(0);
    expect(r.out).toContain('hint: edge order -> cache crosses pay');
    expect((await dgm(dir, ['check', 'a.drawio'])).code).toBe(0);
  });

  it('a line that runs along a box border', async () => {
    const dir = tmpDir();
    await dgm(dir, ['create', 'a.drawio'], 'nodes: {a: {title: A, at: [0, 0]}, b: {title: B, at: [0, 300]}, c: {title: C, at: [400, 150]}}\nedges: [{from: "a:r", to: "b:r", via: x=400}]');
    expect((await dgm(dir, ['check', 'a.drawio'])).out).toContain('hint: edge a -> b crosses c');
  });

  it('counts line crossings', async () => {
    const dir = tmpDir();
    await dgm(dir, ['create', 'a.drawio'], 'nodes: {a: {title: A, at: [0, 0]}, b: {title: B, at: [400, 300]}, c: {title: C, at: [0, 300]}, d: {title: D, at: [400, 0]}}\nedges: ["a:r -> b:l", "c:r -> d:l"]');
    expect((await dgm(dir, ['check', 'a.drawio'])).out).toContain('hint: 1 line crossing');
  });

  it('almost horizontal', async () => {
    const dir = tmpDir();
    write(dir, 'x', '');
    await dgm(dir, ['create', 'a.drawio'], 'nodes: {a: {title: A, at: [0, 128]}, b: {title: B, at: [400, 138]}}\nedges: ["a:r -> b:l"]');
    expect((await dgm(dir, ['check', 'a.drawio'])).out).toContain('hint: edge a -> b is almost horizontal (off by 10 px)');
  });
});
