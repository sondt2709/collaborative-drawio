import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrast, invertLightness } from '../src/theme/color.js';
import { dgm, mxCellOf, drawioSave, tmpDir, SMALL } from './helpers.js';

describe('dgm check', () => {
  it('passes for a diagram that dgm wrote', async () => {
    const dir = tmpDir();
    await dgm(dir, ['create', 'a.drawio'], SMALL);
    expect(await dgm(dir, ['check', 'a.drawio'])).toEqual({ code: 0, out: 'check: ok', err: '' });
  });

  it('reports a low-contrast human edit with the cell id and the ratio', async () => {
    const dir = tmpDir();
    await dgm(dir, ['create', 'a.drawio'], SMALL);
    drawioSave(join(dir, 'a.drawio'), (root) => {
      const c = mxCellOf(root, 'api');
      c.setAttribute('style', (c.getAttribute('style') ?? '').replace(/fillColor=[^;]+/, 'fillColor=#FFFFFF').replace(/fontColor=[^;]+/, 'fontColor=#EEEEEE'));
    });
    const r = await dgm(dir, ['check', 'a.drawio']);
    expect(r.code).toBe(1);
    expect(r.out).toContain('api: raw color fillColor=#FFFFFF');
    expect(r.out).toMatch(/api: contrast 1\.1\d in light mode \(text #EEEEEE on #FFFFFF\), needs 3/);
  });

  it('a default font color on a light raw fill fails in dark mode', async () => {
    const dir = tmpDir();
    await dgm(dir, ['create', 'a.drawio'], SMALL);
    drawioSave(join(dir, 'a.drawio'), (root) => {
      const c = mxCellOf(root, 'db');
      c.setAttribute('style', 'rounded=0;whiteSpace=wrap;html=1;fillColor=light-dark(#FFFFFF,#FFFFFF);');
    });
    const r = await dgm(dir, ['check', 'a.drawio']);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/db: contrast 1\.00 in dark mode \(text #FFFFFF on #FFFFFF\)/);
  });

  it('color helpers', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    expect(invertLightness('#FFFFFF')).toBe('#000000');
    expect(invertLightness('#DAE8FC').startsWith('#')).toBe(true);
  });
});
