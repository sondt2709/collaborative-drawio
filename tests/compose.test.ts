import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { readView } from '../src/diagram.js';
import { DrawioDoc } from '../src/model/doc.js';
import { overlap } from '../src/layout/layout.js';
import { dgm, read, tmpDir } from './helpers.js';

const view = (dir: string) => readView(DrawioDoc.parse(read(dir, 'a.drawio')));
const geo = (dir: string, id: string) => view(dir).byId.get(id)!.geo;

const THREE = `rows:
  - [users]
  - [left, middle, [right1, right2]]
nodes:
  users: Users
  left: {kind: zone, title: Left, nodes: {a: A, b: B, c: C}}
  middle: {kind: zone, title: Middle, nodes: {d: D}}
  right1: {kind: zone, title: Right 1, nodes: {e: E}}
  right2: {kind: zone, title: Right 2, nodes: {f: F}}
edges:
  - users -> d
  - d -> e
`;

describe('rows and columns', () => {
  it('three regions side by side, below the first row, with the same height', async () => {
    const dir = tmpDir();
    const r = await dgm(dir, ['create', 'a.drawio'], THREE);
    expect(r.code).toBe(0);
    const [u, l, m, r1, r2] = ['users', 'left', 'middle', 'right1', 'right2'].map((id) => geo(dir, id));
    expect(l.y).toBe(m.y);
    expect(l.y).toBeGreaterThan(u.y + u.h);
    expect(l.h).toBe(m.h);
    expect(m.x).toBeGreaterThan(l.x + l.w);
    // A column: right2 below right1, same width, and the column fills the row height.
    expect(r1.x).toBeGreaterThan(m.x + m.w);
    expect(r2.x).toBe(r1.x);
    expect(r2.y).toBeGreaterThan(r1.y + r1.h);
    expect(r1.w).toBe(r2.w);
    expect(r2.y + r2.h).toBe(l.y + l.h);
    const v = view(dir);
    for (const n of v.nodes) for (const o of v.nodes) if (n.id < o.id && n.parent === o.parent) expect(overlap(n.geo, o.geo), `${n.id} ${o.id}`).toBe(false);
  });

  it('rows of a zone, and children that rows does not name go last', async () => {
    const dir = tmpDir();
    await dgm(dir, ['create', 'a.drawio'], 'nodes:\n  z: {kind: zone, rows: [[c, a], [b]], nodes: {a: A, b: B, c: C, d: D}}\n');
    const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((id) => geo(dir, id));
    expect(c.y).toBe(a.y);
    expect(a.x).toBeGreaterThan(c.x);
    expect(b.y).toBeGreaterThan(a.y + a.h);
    expect(d.y).toBeGreaterThan(b.y + b.h);
  });

  it('is deterministic', async () => {
    const d1 = tmpDir();
    const d2 = tmpDir();
    await dgm(d1, ['create', 'a.drawio'], THREE);
    await dgm(d2, ['create', 'a.drawio'], THREE);
    expect(read(d1, 'a.drawio')).toBe(read(d2, 'a.drawio'));
  });

  it('rejects unknown ids and ids that appear twice', async () => {
    const r = await dgm(tmpDir(), ['create', 'a.drawio'], 'rows: [[a, cache], [a]]\nnodes: {a: A, z: {kind: zone, rows: [[q]], nodes: {x: X}}}\n');
    expect(r.code).toBe(2);
    expect(r.err).toContain('rows: "cache" is not a top-level node');
    expect(r.err).toContain('rows: "a" appears more than once');
    expect(r.err).toContain('nodes.z.rows: "q" is not a child of z');
    expect((await dgm(tmpDir(), ['create', 'a.drawio'], 'nodes: {page: A}')).err).toContain('the id "page" is reserved');
  });

  it('show prints rows, width and layout: false, and create reads them back', async () => {
    const dir = tmpDir();
    await dgm(dir, ['create', 'a.drawio'], `width: 2000\n${THREE}  - {from: e, to: f, layout: false}\n`);
    const shown = (await dgm(dir, ['show', 'a.drawio'])).out;
    const y = parse(shown);
    expect(y.width).toBe(2000);
    expect(y.rows).toEqual([['users'], ['left', 'middle', ['right1', 'right2']]]);
    expect(y.edges[2]).toEqual({ from: 'e', to: 'f', layout: false });
    await dgm(dir, ['create', 'b.drawio'], shown);
    expect((await dgm(dir, ['show', 'b.drawio'])).out).toBe(shown);
  });

  it('set page rows, then dgm layout places them', async () => {
    const dir = tmpDir();
    await dgm(dir, ['create', 'a.drawio'], 'nodes: {a: A, b: B, c: C}');
    const r = await dgm(dir, ['apply', 'a.drawio'], 'set: {page: {rows: [[a, b], [c]]}}');
    expect(r.code).toBe(0);
    expect(r.out).toContain('Run dgm layout');
    await dgm(dir, ['layout', 'a.drawio']);
    const [a, b, c] = ['a', 'b', 'c'].map((id) => geo(dir, id));
    expect(a.y).toBe(b.y);
    expect(c.y).toBeGreaterThan(a.y + a.h);
    expect((await dgm(dir, ['apply', 'a.drawio'], 'set: {page: {rows: [[nope]]}}')).err).toContain('"nope" is not a top-level node');
  });
});

describe('edges without a layout effect', () => {
  it('an edge with layout: false does not move nodes', async () => {
    const base = 'nodes: {in: In, svc: Svc, out: Out}\nedges:\n  - in -> svc\n';
    const d1 = tmpDir();
    const d2 = tmpDir();
    await dgm(d1, ['create', 'a.drawio'], base);
    await dgm(d2, ['create', 'a.drawio'], `${base}  - {from: svc, to: out, layout: false}\n`);
    expect(geo(d2, 'out')).toEqual(geo(d1, 'out'));
    expect(view(d2).edges.find((e) => e.ref === 'svc -> out')!.layout).toBe(false);
  });
});

describe('bands inside zones', () => {
  it('a band divides the zone', async () => {
    const dir = tmpDir();
    await dgm(dir, ['create', 'a.drawio'], 'nodes:\n  z:\n    kind: zone\n    nodes:\n      a: A\n      b: B\n      net: {kind: band, title: Private network}\n      c: C\nedges: [a -> b, b -> c]\n');
    const [a, b, net, c, z] = ['a', 'b', 'net', 'c', 'z'].map((id) => geo(dir, id));
    expect(net.y).toBeGreaterThan(Math.max(a.y + a.h, b.y + b.h));
    expect(c.y).toBeGreaterThan(net.y + net.h);
    expect(net.w).toBe(z.w - 40);
  });
});

describe('page width', () => {
  it('width sets where unconnected groups wrap', async () => {
    const zones = Array.from({ length: 4 }, (_, i) => `  z${i}: {kind: zone, style: {width: 700}, nodes: {c${i}: C${i}}}`).join('\n');
    const d1 = tmpDir();
    const d2 = tmpDir();
    await dgm(d1, ['create', 'a.drawio'], `nodes:\n${zones}\n`);
    await dgm(d2, ['create', 'a.drawio'], `width: 2400\nnodes:\n${zones}\n`);
    const y = (dir: string) => ['z0', 'z1', 'z2', 'z3'].map((id) => geo(dir, id).y);
    expect(new Set(y(d1).slice(0, 2)).size).toBe(2);
    const wide = y(d2);
    expect(wide[0]).toBe(wide[1]);
    expect(wide[1]).toBe(wide[2]);
    expect(wide[3]).toBeGreaterThan(wide[0]);
  });
});

describe('show --geometry', () => {
  it('adds the size of each node as a comment, and the output is still valid input', async () => {
    const dir = tmpDir();
    await dgm(dir, ['create', 'a.drawio'], THREE);
    const out = (await dgm(dir, ['show', 'a.drawio', '--geometry'])).out;
    expect(out).toMatch(/^  left: # size \d+x\d+$/m);
    expect(out).toMatch(/users: \{.*at: \[ 40, \d+ \] \} # size 210x\d+/);
    expect((await dgm(dir, ['create', 'b.drawio'], out)).code).toBe(0);
  });
});

describe('the built CLI', () => {
  it('a reader that closes the pipe early is not an error', async () => {
    const { execSync } = await import('node:child_process');
    const { join } = await import('node:path');
    const dir = tmpDir();
    await dgm(dir, ['create', 'a.drawio'], THREE);
    const cli = join(import.meta.dirname, '..', 'dist', 'cli.js');
    const out = execSync(`node ${JSON.stringify(cli)} show a.drawio | head -1; echo "status=\${PIPESTATUS[0]:-ok}"`, { cwd: dir, shell: '/bin/bash', encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    expect(out).toMatch(/^theme: pro\nstatus=0/);
  });
});

