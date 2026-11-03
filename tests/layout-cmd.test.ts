import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readView } from '../src/diagram.js';
import { DrawioDoc } from '../src/model/doc.js';
import { dgm, drawioSave, mxCellOf, read, tmpDir, SMALL } from './helpers.js';

const view = (dir: string) => readView(DrawioDoc.parse(read(dir, 'a.drawio')));
const moveDb = (dir: string) =>
  drawioSave(join(dir, 'a.drawio'), (root) => {
    const g = mxCellOf(root, 'db').getElementsByTagName('mxGeometry')[0];
    g.setAttribute('x', '2000');
    g.setAttribute('y', '1500');
    const a = mxCellOf(root, 'api').getElementsByTagName('mxGeometry')[0];
    a.setAttribute('x', '900');
  });

describe('dgm layout', () => {
  it('places all nodes again with the create rules', async () => {
    const dir = tmpDir();
    await dgm(dir, ['create', 'a.drawio'], SMALL);
    const first = view(dir);
    moveDb(dir);
    const r = await dgm(dir, ['layout', 'a.drawio']);
    expect(r.code).toBe(0);
    const v = view(dir);
    expect(v.byId.get('db')!.geo).toEqual(first.byId.get('db')!.geo);
    expect(v.byId.get('api')!.geo).toEqual(first.byId.get('api')!.geo);
  });

  it('--keep-moved keeps nodes that a person moved', async () => {
    const dir = tmpDir();
    await dgm(dir, ['create', 'a.drawio'], SMALL);
    const first = view(dir);
    moveDb(dir);
    // A status --ack between the turns must not hide the move.
    await dgm(dir, ['status', 'a.drawio', '--ack']);
    const r = await dgm(dir, ['layout', 'a.drawio', '--keep-moved']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('kept: api, db');
    const v = view(dir);
    expect(v.byId.get('db')!.geo).toMatchObject({ x: 2000, y: 1500 });
    expect(v.byId.get('api')!.geo.x).toBe(900);
    // The other nodes are placed again from the page margin.
    expect(v.byId.get('core')!.geo.x).toBe(first.byId.get('core')!.geo.x);
  });

  it('--keep-moved keeps a person\'s move after a later apply', async () => {
    const dir = tmpDir();
    await dgm(dir, ['create', 'a.drawio'], SMALL);
    moveDb(dir);
    // apply records the human move first, then its own snapshot (which contains the move).
    expect((await dgm(dir, ['apply', 'a.drawio'], 'add: {x: X}')).code).toBe(0);
    const r = await dgm(dir, ['layout', 'a.drawio', '--keep-moved']);
    expect(r.out).toContain('kept: api, db');
    expect(view(dir).byId.get('db')!.geo).toMatchObject({ x: 2000, y: 1500 });
    // The node that the agent added is placed again, not kept.
    expect(r.out).not.toMatch(/kept: .*\bx\b/);
  });
});
