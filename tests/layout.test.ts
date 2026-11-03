import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readView } from '../src/diagram.js';
import { overlap } from '../src/layout/layout.js';
import { DrawioDoc } from '../src/model/doc.js';
import { dgm, read, tmpDir } from './helpers.js';

const BIG = `nodes:
  a: {title: Users, icon: users}
  b: {title: Partners, icon: handshake}
  z1:
    kind: zone
    title: Zone one
    nodes:
      c1: {title: Card 1, sub: one}
      c2: {title: Card 2, sub: two}
      c3: {title: Card 3, sub: three}
      c4: {title: Card 4, sub: four}
      ch1: {kind: chip, title: Chip one}
      n1: {kind: note, title: A note.}
  z2:
    kind: zone
    title: Zone two
    nodes:
      c5: {title: Card 5}
      c6: {title: Card 6}
      c7: {title: Card 7}
      c8: {title: Card 8, sub: eight}
  band: {kind: band, title: A band across the page}
  z3:
    kind: zone
    title: Zone three
    nodes:
      c9: {title: Card 9}
      c10: {title: Card 10}
      c11: {kind: cylinder, title: DB, icon: database}
      c12: {title: Card 12}
edges:
  - a -> c1
  - b -> c2
  - c1 -> c5
  - c2 -> c6
  - c3 -> c7
  - c4 -> c8
  - c5 -> c9
  - c6 -> c10
  - c7 -> c11
  - c8 -> c12
`;

describe('layout', () => {
  it('no sibling overlaps, and each child is inside its zone', async () => {
    const dir = tmpDir();
    expect((await dgm(dir, ['create', 'big.drawio'], BIG)).code).toBe(0);
    const v = readView(DrawioDoc.parse(readFileSync(join(dir, 'big.drawio'), 'utf8')));
    for (const n of v.nodes) {
      for (const m of v.nodes) {
        if (n.id < m.id && n.parent === m.parent) expect(overlap(n.geo, m.geo), `${n.id} overlaps ${m.id}`).toBe(false);
      }
      if (n.parent !== 'page') {
        const z = v.byId.get(n.parent)!;
        expect(n.geo.x >= 0 && n.geo.y >= 0 && n.geo.x + n.geo.w <= z.geo.w && n.geo.y + n.geo.h <= z.geo.h, `${n.id} inside ${z.id}`).toBe(true);
      }
    }
    // The band spans the content width.
    const band = v.byId.get('band')!;
    const right = Math.max(...v.nodes.filter((n) => n.parent === 'page' && n.id !== 'band').map((n) => n.geo.x + n.geo.w));
    expect(band.geo.x + band.geo.w).toBeGreaterThanOrEqual(right);
    // Direction down: chips and notes go beside the connected cards (to the right), the note below the chips.
    const cards = ['c1', 'c2', 'c3', 'c4'].map((id) => v.byId.get(id)!.geo);
    const ch1 = v.byId.get('ch1')!.geo;
    const n1 = v.byId.get('n1')!.geo;
    expect(ch1.x).toBeGreaterThan(Math.max(...cards.map((c) => c.x + c.w)));
    expect(n1.y).toBeGreaterThan(ch1.y + ch1.h - 1);
  });

  it('is deterministic: the same YAML gives byte-identical files', async () => {
    const d1 = tmpDir();
    const d2 = tmpDir();
    await dgm(d1, ['create', 'arch.drawio'], BIG);
    await dgm(d2, ['create', 'arch.drawio'], BIG);
    expect(read(d1, 'arch.drawio')).toBe(read(d2, 'arch.drawio'));
    await dgm(d1, ['create', 'arch.drawio', '--force'], BIG);
    expect(read(d1, 'arch.drawio')).toBe(read(d2, 'arch.drawio'));
  });

  it('keeps nodes with at', async () => {
    const dir = tmpDir();
    await dgm(dir, ['create', 'a.drawio'], 'nodes: {a: {title: A, at: [500, 300]}, b: B}\n');
    const v = readView(DrawioDoc.parse(read(dir, 'a.drawio')));
    expect(v.byId.get('a')!.geo).toMatchObject({ x: 500, y: 300 });
  });

  it('a compound zone in direction down is as tall as its content (elkjs minimum-size workaround)', async () => {
    const dir = tmpDir();
    await dgm(dir, ['create', 'a.drawio'], 'nodes:\n  top: Top\n  z: {kind: zone, title: A rather long zone title for width, nodes: {a: A, b: B}}\nedges: [top -> a, top -> b]\n');
    const v = readView(DrawioDoc.parse(read(dir, 'a.drawio')));
    const z = v.byId.get('z')!.geo;
    const a = v.byId.get('a')!.geo;
    expect(z.h).toBe(a.y + a.h + 20);
  });
});
