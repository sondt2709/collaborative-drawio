import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { dgm, drawioSave, addRawCell, read, tmpDir, write, SMALL } from './helpers.js';

const ROOT = join(import.meta.dirname, '..');

describe('dgm create and dgm show', () => {
  it('round trip on examples/order-system.yaml', async () => {
    const dir = tmpDir();
    const src = readFileSync(join(ROOT, 'examples/order-system.yaml'), 'utf8');
    const c = await dgm(dir, ['create', 'order.drawio'], src);
    expect(c.code).toBe(0);
    expect(c.out).toContain('order.drawio: 10 nodes, 4 edges, theme pro (turn-1)');
    expect(c.out).toContain('check: ok');
    const s = await dgm(dir, ['show', 'order.drawio']);
    expect(s.code).toBe(0);
    const shown = parse(s.out);
    const orig = parse(src);
    expect(shown.title).toBe(orig.title);
    expect(shown.subtitle).toBe(orig.subtitle);
    // Same nodes, kinds, tones, icons, titles and subtitles.
    const norm = (nodes: Record<string, unknown>): unknown =>
      Object.fromEntries(
        Object.entries(nodes).map(([id, v]) => {
          const o: Record<string, unknown> = typeof v === 'string' ? { title: v } : { ...(v as Record<string, unknown>) };
          if (o.nodes) o.nodes = norm(o.nodes as Record<string, unknown>);
          if (o.kind === 'card') delete o.kind;
          return [id, o];
        }),
      );
    expect(norm(shown.nodes)).toEqual(norm(orig.nodes));
    expect(shown.edges).toEqual([
      { 'web -> api': 'HTTPS' },
      { from: 'api', to: 'svc', label: 'REST', kind: 'new', badge: '1' },
      { 'svc -> pay': 'events' },
      'svc -> db',
    ]);
    expect(s.out).not.toMatch(/#[0-9A-F]{6}|width|height/i);
  });

  it('show --geometry adds at to each node', async () => {
    const dir = tmpDir();
    await dgm(dir, ['create', 'a.drawio'], SMALL);
    const s = parse((await dgm(dir, ['show', 'a.drawio', '--geometry'])).out);
    expect(s.nodes.api.at).toHaveLength(2);
    expect(s.nodes.core.nodes.svc.at).toHaveLength(2);
  });

  it('refuses to replace a file without --force', async () => {
    const dir = tmpDir();
    write(dir, 'a.drawio', 'keep');
    const r = await dgm(dir, ['create', 'a.drawio'], 'nodes: {a: A}');
    expect(r.code).toBe(2);
    expect(read(dir, 'a.drawio')).toBe('keep');
    expect((await dgm(dir, ['create', 'a.drawio', '--force'], 'nodes: {a: A}')).code).toBe(0);
  });

  it('reads YAML from --from', async () => {
    const dir = tmpDir();
    write(dir, 'spec.yaml', 'nodes: {a: A}');
    expect((await dgm(dir, ['create', 'a.drawio', '--from', 'spec.yaml'])).code).toBe(0);
    expect((await dgm(dir, ['create', 'b.drawio'])).code).toBe(2);
  });

  it('shows a cell drawn by a person as kind raw', async () => {
    const dir = tmpDir();
    await dgm(dir, ['create', 'a.drawio'], SMALL);
    drawioSave(join(dir, 'a.drawio'), (root, doc) => addRawCell(root, doc, 'Rd5zXN7w2k1L-3', 'Stripe'));
    const s = parse((await dgm(dir, ['show', 'a.drawio'])).out);
    expect(s.nodes['Rd5zXN7w2k1L-3']).toEqual({ kind: 'raw', title: 'Stripe' });
  });

  it('stores semantic data as object attributes; helpers have dgm_role', async () => {
    const dir = tmpDir();
    await dgm(dir, ['create', 'a.drawio'], SMALL);
    const xml = read(dir, 'a.drawio');
    expect(xml).toMatch(/<object label="Order Service" dgm_kind="card" dgm_icon="server" id="svc">/);
    expect(xml).toMatch(/<object label="Creates orders" dgm_role="sub" id="svc.sub">/);
    expect(xml).toMatch(/dgm_role="icon" id="svc.icon"/);
    expect(xml).not.toMatch(/\b(host|agent|etag|modified)=/);
  });

  it('help lists all commands', async () => {
    const r = await dgm(tmpDir(), ['--help']);
    for (const c of ['create', 'apply', 'show', 'status', 'log', 'layout', 'check', 'render', 'setup']) expect(r.out).toContain(`  ${c}`);
    expect((await dgm(tmpDir(), ['nope'])).code).toBe(2);
    expect((await dgm(tmpDir(), ['show', 'missing.drawio'])).code).toBe(2);
  });
});
