import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findDrawio } from '../src/commands/render.js';
import { dgm, tmpDir } from './helpers.js';

const ROOT = join(import.meta.dirname, '..');
const examples = readdirSync(join(ROOT, 'examples')).filter((f) => f.endsWith('.yaml'));
const drawio = findDrawio(process.env);

describe('examples', () => {
  it.each(examples)('%s creates without check problems', async (f) => {
    const dir = tmpDir();
    const r = await dgm(dir, ['create', 'out.drawio'], readFileSync(join(ROOT, 'examples', f), 'utf8'));
    expect(r.code, r.out + r.err).toBe(0);
    expect(r.out).toContain('check: ok');
  });

  it.skipIf(!drawio)('renders in light and dark with the draw.io CLI', async () => {
    const dir = tmpDir();
    await dgm(dir, ['create', 'order.drawio'], readFileSync(join(ROOT, 'examples/order-system.yaml'), 'utf8'));
    for (const theme of ['light', 'dark']) {
      const r = await dgm(dir, ['render', 'order.drawio', '--theme', theme, '--scale', '1'], undefined, { DGM_DRAWIO: drawio });
      expect(r.code, r.err).toBe(0);
      expect(readFileSync(join(dir, `order.drawio.${theme}.png`)).subarray(1, 4).toString()).toBe('PNG');
    }
  }, 120_000);

  it('render exits 3 when draw.io is not found', async () => {
    const dir = tmpDir();
    await dgm(dir, ['create', 'a.drawio'], 'nodes: {a: A}');
    const r = await dgm(dir, ['render', 'a.drawio'], undefined, { DGM_DRAWIO: '/nonexistent/drawio' });
    expect(r.code).toBe(3);
    expect(r.err).toContain('DGM_DRAWIO');
  });
});
