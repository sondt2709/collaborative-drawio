import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { addRawCell, byId, dgm, drawioSave, mxCellOf, tmpDir, SMALL } from './helpers.js';

async function created() {
  const dir = tmpDir();
  expect((await dgm(dir, ['create', 'arch.drawio'], SMALL)).code).toBe(0);
  return dir;
}

function renameSvc(root: import('@xmldom/xmldom').Element, to = 'Order API') {
  byId(root, 'svc')!.setAttribute('label', to);
}

describe('snapshots', () => {
  it('create writes a snapshot and a turn-1 agent entry, without XML', async () => {
    const dir = await created();
    const hist = join(dir, '.dgm', 'arch.drawio');
    expect(existsSync(join(hist, 'log.jsonl'))).toBe(true);
    const snaps = readdirSync(join(hist, 'snapshots'));
    expect(snaps).toEqual(['0001.json']);
    const log = await dgm(dir, ['log', 'arch.drawio']);
    expect(log.out).toMatch(/^turn-1 agent /);
  });
});

describe('dgm status', () => {
  it('prints nothing when nothing changed', async () => {
    const dir = await created();
    const r = await dgm(dir, ['status', 'arch.drawio']);
    expect(r).toEqual({ code: 0, out: '', err: '' });
  });

  it('reports a rename and a new raw cell', async () => {
    const dir = await created();
    drawioSave(join(dir, 'arch.drawio'), (root, doc) => {
      renameSvc(root);
      addRawCell(root, doc, 'Rd5zXN7w2k1L-3', 'Stripe');
    });
    const r = await dgm(dir, ['status', 'arch.drawio']);
    expect(r.out.split('\n')).toEqual(['~ svc.title "Order Service" -> "Order API"', '+ Rd5zXN7w2k1L-3 {kind: raw, title: "Stripe"}']);
  });

  it('summarizes moves in one line and lists style keys', async () => {
    const dir = await created();
    drawioSave(join(dir, 'arch.drawio'), (root) => {
      for (const id of ['db', 'api']) mxCellOf(root, id).getElementsByTagName('mxGeometry')[0].setAttribute('x', '999');
      const c = mxCellOf(root, 'pay');
      c.setAttribute('style', `${c.getAttribute('style')}shadow=1;`.replace('fillColor=light-dark(#FFFFFF,#0F172A)', 'fillColor=#FFFFFF'));
    });
    const r = await dgm(dir, ['status', 'arch.drawio']);
    expect(r.out.split('\n')).toEqual(['~ pay style: fillColor, shadow', '~ moved or resized 2 nodes: api, db']);
  });

  it('reports removed nodes and edge changes', async () => {
    const dir = await created();
    drawioSave(join(dir, 'arch.drawio'), (root) => {
      const r = root.getElementsByTagName('root')[0];
      for (const id of ['pay', 'pay.icon']) r.removeChild(byId(root, id)!);
      byId(root, 'e1')!.setAttribute('label', 'gRPC');
    });
    const r = await dgm(dir, ['status', 'arch.drawio']);
    expect(r.out).toContain('- pay {kind: card, title: "Payment worker", in: core}');
    expect(r.out).toContain('~ edge api -> svc.label "REST" -> "gRPC"');
  });

  it('says that a file is not tracked', async () => {
    const dir = await created();
    const { copyFileSync } = await import('node:fs');
    copyFileSync(join(dir, 'arch.drawio'), join(dir, 'other.drawio'));
    expect((await dgm(dir, ['status', 'other.drawio'])).out).toMatch(/is not tracked/);
  });
});

describe('acknowledge human changes', () => {
  it('several saves become one human entry, and no repeated report', async () => {
    const dir = await created();
    const f = join(dir, 'arch.drawio');
    drawioSave(f, (root) => renameSvc(root, 'A'));
    drawioSave(f, (root) => renameSvc(root, 'B'));
    drawioSave(f, (root) => renameSvc(root, 'Order API'));
    const first = await dgm(dir, ['status', 'arch.drawio', '--ack']);
    expect(first.out).toBe('~ svc.title "Order Service" -> "Order API"');
    const second = await dgm(dir, ['status', 'arch.drawio', '--ack']);
    expect(second.out).toBe('');
    const log = (await dgm(dir, ['log', 'arch.drawio'])).out.split('\n');
    expect(log.map((l) => l.split(/\s{2,}/)[0].trim())).toEqual(['human', 'turn-1 agent']);
  });

  it('apply records pending human changes first: turn-2, human, turn-1', async () => {
    const dir = await created();
    drawioSave(join(dir, 'arch.drawio'), (root) => renameSvc(root));
    expect((await dgm(dir, ['apply', 'arch.drawio'], 'add: {x: X}')).code).toBe(0);
    const log = (await dgm(dir, ['log', 'arch.drawio'])).out.split('\n');
    expect(log).toHaveLength(3);
    expect(log[0]).toMatch(/^turn-2 agent .*apply: \+1 node: x/);
    expect(log[1]).toMatch(/^human .*1 changed/);
    expect(log[2]).toMatch(/^turn-1 agent .*create: 5 nodes, 2 edges/);
    // The agent's own change is not reported as a human change.
    expect((await dgm(dir, ['status', 'arch.drawio'])).out).toBe('');
  });
});
